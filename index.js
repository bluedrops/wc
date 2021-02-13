import Main from "./Main";

const site = "aukamicreations";

const keywords = [
  'byo',
  'build your own',
  'buildyourown',
  'build',
  'custom',
];

const blacklist = [
  'poster'
];

const proxies = [
];

const delay = 2500;

(async () => {
  await Main.init({site, keywords, blacklist, proxies, delay});
  await Main.run();
})();