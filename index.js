import Main from "./Main";

const site = "aukamicreations";

const keywords = [
  'modern wolf'
];

const blacklist = [

];

const proxies = [
];

const delay = 2500;

(async () => {
  await Main.init({site, keywords, blacklist, proxies, delay});
  await Main.run();
})();