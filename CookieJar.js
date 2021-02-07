class CookieJar {
  constructor() {
    this.cookies = {};
    this.puppeteer_cookies = [];
  }

  updateCookies(cookie_array) {
    if (!cookie_array || cookie_array.length === 0) return;
    this.updatePuppeteerCookies(cookie_array);

    const cookie_dict = cookie_array.reduce((dict, cookie_str) => {
      const name = cookie_str.split(/(?==)(.+)/)[0];
      const value = `${cookie_str.split(/(?==)(.+)/)[1]}`;
      dict[name] = value;
      return dict;
    }, {});

    Object.assign(this.cookies, cookie_dict);
    console.log('\n');
  }

  updatePuppeteerCookies(cookie_array) {
    const c = {};
    cookie_array.forEach((cookie) => {
      const name = cookie.split(/(?==)(.+)/)[0];
      let value = `${cookie.split(/(?==)(.+)/)[1]}`;

      value = value.replace('=','');

      c.name = name;

      let tokens = value.split('; ');
      c.value = tokens.shift();

      tokens.forEach((token) => {
        const cookz = token.split('=');
        if (cookz.length === 1) {
          c[`${token}`] = true;
        } else {
          if (cookz.length > 2) {
            console.log("\n\n\nUNEXPECTED COOKIE\n\n\n");
          } else {

            if(cookz[0] === 'expires') {
              c[`${cookz[0]}`] = new Date(cookz[1]).getTime();
            } else {
              c[`${cookz[0]}`] = cookz[1];
            }
          }
        }
      });

      c.url = 'https://aukamicreations.com/';
      c.domain = 'aukamicreations.com'
    });
    this.puppeteer_cookies.push(Object.assign({}, c))
  }

  getCookies() {
    return Object.entries(this.cookies).reduce((acc, [key, value]) => acc += `${key}${value}; `, '');
  }

  serializePuppeteerCookie(cookie_obj) {
    let s = '';
    s += `${cookie_obj.name}=${cookie_obj.value}; `;
    delete cookie_obj.name;
    delete cookie_obj.value;
    Object.entries(cookie_obj).forEach(([key, value]) => {
      if (typeof(value) === "boolean") {
        if (value) {
          s += `${key}; `;
        }
      } else {
        s += `${key}=${value}; `
      }
    });
    return s;
  }

  serializePuppeteerCookies(cookie_obj_arr) {
    let s = '';
    cookie_obj_arr.forEach((cookie_obj) => s += this.serializePuppeteerCookie(cookie_obj))
    return s;
  }

  arraySerializePuppeteerCookies(cookie_obj_arr) {
    let arr = [];
    cookie_obj_arr.forEach((cookie_obj) => arr.push(this.serializePuppeteerCookie(cookie_obj)));
    return arr;
  }

  parseCookiesToCookieObj(cookie_arr) {
    return cookie_arr.map((cookie_str) => {
      let tokens = cookie_str.split('; ');
      let first_token = tokens.shift();
      let [name, value] = first_token.split(/=(.+)/);
      if (value === undefined && name.charAt(name.length-1) === '=') {
      	value = "";
        name = name.slice(0, -1);
      }
      let cookie_obj = {
        name,
        value
      };
      tokens.forEach((token) => {
        let [k, v] = token.split(/=(.+)/);
        if (v === undefined) {
          v = true;
        }
        cookie_obj[k] = v;
      })
      return cookie_obj;
    });
  }
}

export default CookieJar;