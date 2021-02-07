import CookieJar from "./CookieJar";
import ProxyHandler from './ProxyHandler';

const axios = require("axios");
const qs = require("qs");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");

const ACTIONS = {
  ADD_TO_CART: 'wc-ajax=add_to_cart',
  WC_STRIPE_GET_CART_DETAILS: 'wc-ajax=wc_stripe_get_cart_details'
}

class Main {
  constructor() {
    this.session = axios.create({ withCredentials: true })
    this.jar = new CookieJar();
    this.requests = 0;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async testProxies(idx) {
    if(!idx) idx = 1;
    const ip_test_url = 'https://api.myip.com';
    const shopify_test_url = `https://hoshiikins.com/products.json`;

    const url = ip_test_url;
    // const url = shopify_test_url;

    const proxy = this.proxy_queue.getProxy();
    if (proxy) this.log(`Testing proxy ${proxy.id}\t(${proxy.uri})`);

    const timerA = Date.now();
    let response = await axios.get(url,{
      httpsAgent: proxy.agent,
      timeout: 3000
    }).catch(async error => {
      console.log(`\t[❌] code: ${error.code}\n\terrno: ${error.errno} | syscall: ${error.syscall}`);
      if(idx < this.proxies.length) {
        await this.testProxies(idx+1);
      }
      return;
    });

    if (response) {
      if (url == ip_test_url) {
        const proxy_ip = proxy.uri.split('@')[1] ? (proxy.uri.split('@')[1]).split(':')[0] : (proxy.uri.split('//')[1].split(':')[0]);
        // console.log(`\tOriginating ip: ${response.data.ip}`);
        console.log(`\t${(response.data.ip == proxy_ip) ? '[✅]' : '[❌]'} Originating IP matches Proxy IP\n\tRequest Speed: ${(Date.now()-timerA) / 1000} seconds`);
        // console.log(`\tLast used: ${proxy.last_used ? `${(Date.now()-proxy.last_used)/1000} seconds ago` : `Never`}\n\tRequest Speed: ${(Date.now()-timerA) / 1000} seconds\n\t${(response.data.ip == proxy_ip) ? '[✅]' : '[❌]'} Originating IP matches Proxy IP\n`)  

        // console.log(`\tLast used: ${proxy.last_used ? `${(Date.now()-proxy.last_used)/1000} seconds ago` : `Never`}\n\tRequest Speed: ${(Date.now()-timerA) / 1000} seconds\n\t${(response.data.ip == proxy_ip) ? '[✅]' : '[❌]'} Originating IP matches Proxy IP\n`)  
      }
      else if (url == shopify_test_url) {
        if (proxy)
          console.log(`\tSuccess: ${response.data.products.length} products found.\n\tLatest product: ${response.data.products[0].title}\n\tLast used: ${proxy.last_used ? `${(Date.now()-proxy.last_used)/1000} seconds ago` : `Never`}\n\tRequest Speed: ${(Date.now()-timerA) / 1000} seconds\n`)
        else
          console.log(`\tSuccess: ${response.data.products.length} products found.\n\tLatest product: ${response.data.products[0].title}\n\tRequest Speed: ${(Date.now()-timerA) / 1000} seconds\n`)
      }
  
      if(idx < this.proxies.length) {
        await this.testProxies(idx+1);
      }
    }
  }

  async decrementCounter() {
    await this.sleep(60000);
    this.requests = this.requests - 1;
  }

  async init(config) {
    this.site = config.site;
    this.keywords = config.keywords;
    this.blacklist = config.blacklist;
    this.delay = config.delay;
    this.proxies = config.proxies;
    this.proxy_queue = new ProxyHandler(this.proxies);

    this.browser = await puppeteer.launch({
      headless: false,
      args: [
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=800,800'
      ]
    });
    this.page = await this.browser.newPage();

    await this.page.setRequestInterception(true);
    
    this.page.on('request', (req) => {
      if(req.resourceType() == 'stylesheet' || req.resourceType() == 'font' || req.resourceType() == 'image'){
        req.abort();
      }
      else {
        req.continue();
      }
    });
  }

  parseWooCommerceProductElement($, el) {
    const title = $(el).find('h2.woocommerce-loop-product__title').text();
    const url = $(el).find('a.woocommerce-loop-product__link').attr('href');

    let product_id = $(el).find('a.add_to_cart_button').attr('data-product_id');
    let product_sku = $(el).find('a.add_to_cart_button').attr('data-product_sku');

    if (!product_id || !product_sku) {
      product_id = $(el).find('a.product_type_simple').attr('data-product_id');
      product_sku = $(el).find('a.product_type_simple').attr('data-product_sku');
    }
    let price = $(el).find('.price').text();
    if (price.split('–').length > 1) {
      // Range of prices given
      let prices = [];
      let tokens = price.split('–');
      tokens.forEach(token => {
        prices.push(token.replace(/[^\d.-]/g, '').trim());
      });
      price = prices;
    } else if (price.split(' ').length > 1 ) {
      price = price.split(' ')[1].replace(/[^\d.-]/g, '').trim();
    } else {
      price = price.replace(/[^\d.-]/g, '').trim();
    }

    return Object.assign({}, { title, url, product_id, product_sku, price });
  }

  async atc(product) {
    this.log(`Found a product that matches keywords: ${product.title}`);

    const payload = {
      product_sku: product.product_sku,
      product_id: product.product_id,
      quantity: 1
    };

    const atc_url = `https://${this.site}.com/?${ACTIONS.ADD_TO_CART}`;
    const response = await this.session.post(atc_url, qs.stringify(payload), this.getHeaders());

    if (response.status === 200) {
      this.jar.updateCookies(response.headers['set-cookie']);
      const { cart_hash, fragments } = response.data;
      this.cart_hash = cart_hash;
      this.fragments = fragments;
      this.checkout()
    }
  }

  waitForNetworkIdle(page, timeout, maxInflightRequests = 0) {
    page.on('request', onRequestStarted);
    page.on('requestfinished', onRequestFinished);
    page.on('requestfailed', onRequestFinished);
  
    let inflight = 0;
    let fulfill;
    let promise = new Promise(x => fulfill = x);
    let timeoutId = setTimeout(onTimeoutDone, timeout);
    return promise;
  
    function onTimeoutDone() {
      page.removeListener('request', onRequestStarted);
      page.removeListener('requestfinished', onRequestFinished);
      page.removeListener('requestfailed', onRequestFinished);
      fulfill();
    }
  
    function onRequestStarted() {
      ++inflight;
      if (inflight > maxInflightRequests)
        clearTimeout(timeoutId);
    }
    
    function onRequestFinished() {
      if (inflight === 0)
        return;
      --inflight;
      if (inflight === maxInflightRequests)
        timeoutId = setTimeout(onTimeoutDone, timeout);
    }
  }


  async getWooCommercePaymentRequestParams($) {
    let str = $('#wc-checkout-js-extra')[0].children[0].data;
    console.log(str);
    str = str.replace('var wc_checkout_params = ', '').slice(0, -1);
    let obj = JSON.parse(str);
    console.log(obj);
    this.wc_checkout_params = Object.assign({}, obj);
  }

  async getStripePaymentRequestParams($) {
    let str = $('script#wc_stripe_payment_request-js-extra')[0].children[0].data;
    str = str.replace('var wc_stripe_payment_request_params = ', '').slice(0, -1);
    let obj = JSON.parse(str);
    console.log(obj);
    this.stripe_payment_request_params = Object.assign({}, obj);
  }

  async checkout() {
    let response, $, payload;
    const checkout_url = `https://${this.site}.com/checkout`;

    // Get security cookies
    const cookies = this.jar.puppeteer_cookies;
    
    this.log(`Serialized requests cookies into browser cookies:`);
    console.log(cookies);

    this.log(`Sending cookies to browser...`);

    

    await this.page.setCookie(...cookies);

    await this.page.goto(checkout_url);
    await this.page.waitForSelector('#billing_first_name');

    // // // fill out fields
    await this.page.$eval('#billing_first_name', el => el.value = 'Zekia');
    await this.page.$eval('#billing_last_name', el => el.value = 'Rina');
    // await this.page.$eval('#billing_country', el => el.value = 'US');
    await this.page.select('#billing_country', 'US');
    await this.page.$eval('#billing_address_1', el => el.value = '34 Country Mile Rd');
    // await this.page.$eval('#billing_address_2', el => el.value = 'Unit 2164');
    await this.page.$eval('#billing_city', el => el.value = 'Pomona');
    await this.page.select('#billing_state', 'CA');
    await this.page.$eval('#billing_postcode', el => el.value = '91766');

    await this.page.$eval('#billing_phone', el => el.value = '7147170829');

    await this.page.$eval('#billing_email', el => el.value = 'zekiaxs@gmail.com');

    await this.page.evaluate(() => {
      document.querySelector('#ship-to-different-address-checkbox').parentElement.click();
    });

    await Promise.all([
      this.waitForNetworkIdle(this.page, 500, 0), // equivalent to 'networkidle0'
    ]);

    await this.page.evaluate(() => {
      document.querySelector('#payment_method_stripe').click();
    });
    // // select stripe
    
    await this.page.waitForSelector('#wc-stripe-cc-form iframe');


    let elementHandle;
    let frame;

    // CARD NUMBER
    elementHandle = await this.page.$('#wc-stripe-cc-form iframe');
    frame = await elementHandle.contentFrame();
    await frame.waitForSelector('input[name="cardnumber"]');
    await frame.focus('input[name="cardnumber"]');
    await frame.type('input[name="cardnumber"]', '5313673434770181', {delay: 25});
    

    // EXP DATE
    elementHandle = await this.page.$('#stripe-exp-element iframe');
    frame = await elementHandle.contentFrame();
    await frame.waitForSelector('input[name="exp-date"]');
    await frame.focus('input[name="exp-date"]');
    await frame.type('input[name="exp-date"]', '0526', {delay: 25});

    // CVC
    elementHandle = await this.page.$('#stripe-cvc-element iframe');
    frame = await elementHandle.contentFrame();
    await frame.waitForSelector('input[name="cvc"]');
    await frame.focus('input[name="cvc"]');
    await frame.type('input[name="cvc"]', '978', {delay: 25});
  
    // Terms
    await this.page.evaluate(() => {
      document.querySelector('#terms').parentElement.click();
    });

    await Promise.all([
      this.waitForNetworkIdle(this.page, 500, 0), // equivalent to 'networkidle0'
    ]);

    return;

    // Submit
    await this.page.focus('#place_order');
    await this.page.click('#place_order');
    this.log(`Process finished.`);
    return;
  } 

  async run () {
    let response;
    /* Get cookie crumb */
    // response = await this.session.get(this.url, this.getHeaders());
    // this.jar.updateCookies(response.headers['set-cookie']);

    /* Fetch inventory */
    let target = null;
    while (!target) {
      response = await this.session.get(`https://${this.site}.com/shop/`);
      this.jar.updateCookies(response.headers['set-cookie']);
      if (response && response.status == 200) {
        const $ = cheerio.load(response.data);
        const products = $('li.product');
    
        const in_stock = products.filter((i, el) => {
          return $(el).attr('class').includes('instock')
        });
    
        const out_of_stock = products.filter((i, el) => {
          return $(el).attr('class').includes('outofstock')
        });
    
        this.log(`Site inventory:`)
        this.inventory = [];
        // Parse page
        $(in_stock).each((i, el) => {
          this.inventory.push(Object.assign({}, { in_stock: true }, this.parseWooCommerceProductElement($, el)))
        });
    
        this.inventory.forEach((i) => {
          console.log(i);
        })
    
        target = this.inventory.find((product) => {
          const title = product.title.toLowerCase();
          const cond0 = (product.in_stock === true);
          const cond1 = this.keywords.some(keyword => title.includes(keyword));
          const cond2 = this.blacklist.every(keyword => !title.includes(keyword));
          return cond0 && cond1 && cond2;
        });
    
        if (!target) {
          this.log(`Item not in stock.`);
          await this.sleep(2500);
        }
      }
    }

    if (target) {
        this.log(`Found target item: ${target.title} (id: ${target.id})`);
        // const url = `${this.url}${target.fullUrl}`;

        // this.log(`Launching Chrome to: ${url}`)
        // const CHROME_PATH = 'c:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
        // cp.spawn(CHROME_PATH, ['-new-tab', url]);

        // cp.exec(`open -a "Google Chrome" ${url}`, (data) => { console.log(data) })
        this.atc(target)
        return;
    }

    this.log(`Execution completed.`)
}

  // async run() {
  //   const timerA = Date.now();
  //   this.requests = this.requests + 1;
  //   let response = await axios.get(, {
  //     timeout: 1500
  //   }).catch(async error => {
  //     if (error.response && error.response.status == 430) {

  //     }
  //   });
  //   // Don't await
  //   this.decrementCounter();

  //   if (response && response.status == 200) {
  //     const $ = cheerio.load(response.data);
  //     const products = $('li.product');
  
  //     const in_stock = products.filter((i, el) => {
  //       return $(el).attr('class').includes('instock')
  //     });
  
  //     const out_of_stock = products.filter((i, el) => {
  //       return $(el).attr('class').includes('outofstock')
  //     });
  
  //     this.log(`Site inventory:`)
  //     this.inventory = [];
  //     // Parse page
  //     $(in_stock).each((i, el) => {
  //       this.inventory.push(Object.assign({}, { in_stock: true }, this.parseWooCommerceProductElement($, el)))
  //     });
  
  //     this.inventory.forEach((i) => {
  //       console.log(i);
  //     })
  
  //     const found_product = this.inventory.find((product) => {
  //       const title = product.title.toLowerCase();
  //       const cond0 = (product.in_stock === true);
  //       const cond1 = this.keywords.some(keyword => title.includes(keyword));
  //       const cond2 = this.blacklist.every(keyword => !title.includes(keyword));
  //       return cond0 && cond1 && cond2;
  //     });
  
  //     if (Boolean(found_product)) {
  //       this.atc(found_product);
  //     } else {
  //       let now = Date.now()
  //       let delta;
  //       if (proxy.last_used) {
  //         delta = now - proxy.last_used;
  //       }
  //       const req_speed = now - timerA;
  //       this.log(`Refreshing. \n\tProxy #${proxy.id}: ${proxy.uri} (Req/min: ${this.requests})\n\tLatest product: ${this.inventory[0].title}\n\tLast used: ${proxy.last_used ? `${(delta)/1000} seconds ago` : `Never`}\n\tRequest Speed: ${(req_speed) / 1000} seconds\n`)
  //       const threshold = this.delay / this.proxies.length;
  //       if (req_speed < threshold) {
  //         const delay = threshold-req_speed;
  //         if (delay > 10) await this.sleep(delay);
  //       }

  //       this.run();
  //     }
  //   } else {
  //     let now = Date.now()
  //     let delta;
  //     if (proxy.last_used) {
  //       delta = now - proxy.last_used;
  //     }
  //     const req_speed = now - timerA;
  //     this.log(`Refreshing. \n\tProxy #${proxy.id}: ${proxy.uri} (Req/min: ${this.requests})\n\tLatest product: ${this.inventory[0].title}\n\tLast used: ${proxy.last_used ? `${(delta)/1000} seconds ago` : `Never`}\n\tRequest Speed: ${(req_speed) / 1000} seconds\n`)
  //     const threshold = this.delay / this.proxies.length;
  //     if (req_speed < threshold) {
  //       const delay = threshold-req_speed;
  //       if (delay > 10) await this.sleep(delay);
  //     }

  //     this.run();
  //   }
  // }

  getHeaders() {
    return {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.98 Safari/537.36',
        'Access-Control-Allow-Origin': '*',
        Cookie: this.jar.getCookies()
      },
    };
  }

  time() {
    const now = new Date();
    let h = now.getHours();
    let m = now.getMinutes();
    let s = now.getSeconds();
    let ms = now.getMilliseconds();
    if (h < 10) h = `0${h}`;
    if (m < 10) m = `0${m}`;
    if (s < 10) s = `0${s}`;
    const time = h + ":" + m + ":" + s + "." + ms;
    return time;
  }

  log(string) {
    console.log(`[${this.time()}] | ${string}`);
  }
}

export default new Main();
