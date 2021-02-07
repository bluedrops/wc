const HttpsProxyAgent = require('https-proxy-agent')

class ProxyHandler {
  constructor(proxies) {
    this.container = [];
    this.default_port = 3128;
    proxies.forEach((proxy, idx) => {
      let uri;
      const tokens = proxy.split(':');
      if (tokens.length === 4) { // USER:PW:IP:PORT
        const [ip, port, user, pw] = tokens;
        uri = `http://${user}:${pw}@${ip}:${port}`;
      } else if (tokens.length === 3) { // http://IP:PORT or USER:PW@IP:PORT
        uri = proxy;
      } else if (tokens.length === 2) { // IP:PORT
        uri = `http://${tokens[0]}:${tokens[1]}`;
      } else if (tokens.length === 1) { // IP
        uri = `http://${tokens[0]}:${this.default_port}`
      } else {
        uri = proxy;
      }

      this.container.push({
        agent: new HttpsProxyAgent(uri),
        uri,
        id: idx,
        last_used: 0
      });
    });
  }

  isEmpty() {
     return this.container.length === 0;
  }

  insert(element) {
    this.container.push(element);
  }

  remove() {
    if (this.isEmpty()) {
      return null;
    }
    return this.container.shift();
  }

  getProxy() {
    if (this.isEmpty()) {
      return null;
    }
    const element = this.container.shift();
    this.container.push(Object.assign({}, element, { last_used: Date.now() }));
    return element;
  }

  peek() {
    if (this.isEmpty()) {
      return null;
    }
    return this.container[0];
  }

  clear() {
    this.container = [];
  }
}

export default ProxyHandler