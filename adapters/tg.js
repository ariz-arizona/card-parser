const router = require("express").Router();
const TelegramBot = require("node-telegram-bot-api");
const chrome = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');
// const fetch = require('@vercel/fetch')(require('cross-fetch'));
const { Redis } = require('@upstash/redis/with-fetch');

const { loadPage, constructHostV2, formatter, parseOzonData, timeout, getRandomInt } = require("../helpers");
const shards = require("../data/shards.json");
const booksChildrenBrands = require("../data/books_children_brands.json");

const { TG_TOKEN, CURRENT_HOST, CHANNEL_ID, BOOKS_CHANNEL_ID } = process.env;
const LOCAL_CHROME_EXECUTABLE = '/usr/bin/google-chrome';

const wbUrl = 'wildberries.ru/catalog/';
const ozonUrl = 'ozon.ru/product/';
const detmirUrl = 'detmir.ru/product/index/id/'

const bot = new TelegramBot(TG_TOKEN);
bot.setWebHook(`${CURRENT_HOST}/tg${TG_TOKEN.replace(":", "_")}`, {
  allowed_updates: [
    "message",
    "edited_message",
    "callback_query",
    "inline_query",
  ],
});

bot.on("error", (error) => {
  console.log(error.code);
});

bot.on("polling_error", (error) => {
  console.log(error.code);
});

router.post(`/tg_wb_benefit/tg${TG_TOKEN.replace(":", "_")}/books_children/:id`, async (_req, res) => {
  const { id } = _req.params;
  if (id < 0 || id >= booksChildrenBrands.length) {
    return res.sendStatus(404);
  }

  const shardKey = 'books_children';
  const brand = booksChildrenBrands[id];
  const { name, id: brandId } = brand;
  const url = `https://catalog.wb.ru/catalog/${shardKey}/catalog?dest=-1059500,-72639,-3826860,-5551776&sort=popular&discount=50&brand=${brandId}`;
  const dataRaw = await loadPage(url);
  try {
    const data = JSON.parse(dataRaw);
    const products = data.data.products;
    // console.log({noSort: products[0]})
    products.sort((a, b) => {
      const aMin = Math.min(a.averagePrice, a.priceU);
      const bMin = Math.min(b.averagePrice, b.priceU);
      return (bMin / b.salePriceU) - (aMin / a.salePriceU);
    });

    const product = products[0];
    // console.log({sort: products[0]})
    const redis = Redis.fromEnv();
    const redisKey = `cardparser_${shardKey}_${id}`;
    const savedIDB64 = await redis.get(redisKey);
    const savedID = parseInt(savedIDB64 !== null ? Buffer.from(savedIDB64, 'base64').toString() : 0);
    
    if (product.id && parseInt(savedID) !== parseInt(product.id)) {
      await redis.set(redisKey, product.id);
      const link = `https://${wbUrl}${product.id}/detail.aspx`;
      const imageUrl = constructHostV2(product.id);

      await bot.sendPhoto(BOOKS_CHANNEL_ID,
        `https:${imageUrl}/images/big/1.jpg`,
        {
          caption:
            `Самый выгодный товар по версии WB в категории ${shardKey} для ${name}` +
            `\nРазбор карточки WB <code>${product.id}</code>` +
            `\n${product.brand} <a href="${link}">${product.name}</a>` +
            `\nЦена: ` +
            `${product.salePriceU ?
              `${formatter.format(product.salePriceU / 100)} <s>${formatter.format(product.priceU / 100)}</s>` :
              `${formatter.format(product.priceU / 100)}`
            }` +
            `\nРазмеры: \n${product.sizes.map(el => `\u2705 ${el.name}`).join(', ')}`,
          parse_mode: 'HTML'
        });
    }
  } catch (error) {
    if (error.message.indexOf('ETELEGRAM: 429 Too Many Requests') !== -1) {
      await bot.sendMessage(BOOKS_CHANNEL_ID, error.message.toString().slice(0, 100));
    } else {
      console.log(error.message.toString().slice(0, 100));
    }
  }

  res.sendStatus(200);
});

router.post(`/tg_wb_benefit/tg${TG_TOKEN.replace(":", "_")}/:shardKey`, async (_req, res) => {
  // Список всех категорий
  // https://static.wbstatic.net/data/main-menu-ru-ru.json

  // Ссылка на поиск
  // https://catalog.wb.ru/catalog/${SHARD}/catalog?sort=benefit&${QUERY}

  // kinds
  //  1 - мужской
  //  2 - женский
  //  3 - дети (мальчики?)
  //  5 - дети (девочки?)
  //  6 - малыши

  const { shardKey } = _req.params;
  const shard = shards[shardKey];
  const item = shard[0];
  const { kinds } = item;

  for (let index = 0; index < kinds.length; index++) {
    if (index > 0) {
      await timeout(2000);
    }
    const kind = kinds[index];
    const url = `https://catalog.wb.ru/catalog/${shardKey}/catalog?dest=-1059500,-72639,-3826860,-5551776&sort=popular&discount=90&kind=${kind}`;
    const dataRaw = await loadPage(url);
    try {
      const data = JSON.parse(dataRaw);
      const products = data.data.products;
      products.sort((a, b) => {
        const aMin = Math.min(a.averagePrice, a.priceU);
        const bMin = Math.min(b.averagePrice, b.priceU);
        return (bMin / b.salePriceU) - (aMin / a.salePriceU);
      });

      const product = products[0];

      const redis = Redis.fromEnv();
      const redisKey = `cardparser_${shardKey}_${kind}`;
      const savedIDB64 = await redis.get(redisKey);
      const savedID = parseInt(savedIDB64 !== null ? Buffer.from(savedIDB64, 'base64').toString() : 0);
      // console.log({ savedIDB64, savedID, pid: product.id, shardKey, condition: parseInt(savedID) !== parseInt(product.id) })

      if (product.id && parseInt(savedID) !== parseInt(product.id)) {
        await redis.set(redisKey, product.id);
        const link = `https://${wbUrl}${product.id}/detail.aspx`;
        const imageUrl = constructHostV2(product.id);

        await bot.sendPhoto(CHANNEL_ID,
          `https:${imageUrl}/images/big/1.jpg`,
          {
            caption:
              `Самый выгодный товар по версии WB в категории ${shardKey}` +
              `\nРазбор карточки WB <code>${product.id}</code>` +
              `\n${product.brand} <a href="${link}">${product.name}</a>` +
              `\nЦена: ` +
              `${product.salePriceU ?
                `${formatter.format(product.salePriceU / 100)} <s>${formatter.format(product.priceU / 100)}</s>` :
                `${formatter.format(product.priceU / 100)}`
              }` +
              `\nРазмеры: \n${product.sizes.map(el => `\u2705 ${el.name}`).join(', ')}`,
            parse_mode: 'HTML'
          });
      }
    } catch (error) {
      if (error.message.indexOf('ETELEGRAM: 429 Too Many Requests') !== -1) {
        await bot.sendMessage(CHANNEL_ID, error.message.toString().slice(0, 100));
      } else {
        console.log(error.message.toString().slice(0, 100));
      }
    }
  }
  res.sendStatus(200)
});

router.post(`/tg${TG_TOKEN.replace(":", "_")}`, async (_req, res) => {
  if (_req.body.message) {
    const msgText = _req.body.message.text;
    const msgId = _req.body.message.message_id;
    const chatId = _req.body.message.chat.id;
    // const date = _req.body.message.date;

    try {
      if (msgText && msgText[0] !== "/" && msgText.indexOf(wbUrl) !== -1) {
        console.log(`Сделан запрос ${msgText} от чат айди ${chatId}`);

        const regexp = /wildberries\.ru\/catalog\/(\d*)/;
        const msgMatch = msgText.match(regexp);
        if (!msgMatch.length) {
          await bot.sendMessage(chatId, 'Ссылка не распознана');
        } else {
          const cardId = msgMatch[1];
          const cardUrl = `https://card.wb.ru/cards/detail?dest=-1059500,-72639,-3826860,-5551776&nm=${cardId}`;
          const cardRaw = await loadPage(cardUrl);
          const card = JSON.parse(cardRaw);
          const product = card.data.products[0];
          const imageUrl = constructHostV2(cardId);

          await bot.sendPhoto(chatId,
            `https:${imageUrl}/images/big/1.jpg`,
            {
              caption:
                `Разбор карточки WB <code>${cardId}</code>` +
                `\n${product.brand} <a href="https://${wbUrl}${cardId}/detail.aspx">${product.name}</a>` +
                `\nЦена: ` +
                `${product.salePriceU ?
                  `${formatter.format(product.salePriceU / 100)} <s>${formatter.format(product.priceU / 100)}</s>` :
                  `${formatter.format(product.priceU / 100)}`
                }` +
                `\nРазмеры: \n${product.sizes.map(el =>
                  `${el.stocks.length ? '\u2705' : '\u274c'} ${el.name}`
                ).join(', ')}`,
              parse_mode: 'HTML',
              reply_to_message_id: msgId
            });
        }
      }

      if (msgText && msgText[0] !== "/" && msgText.indexOf(ozonUrl) !== -1) {
        console.log(`Сделан запрос ${msgText} от чат айди ${chatId}`);

        const regexp = /ozon\.ru\/product\/.*?-(\d*?)\//;
        const msgMatch = msgText.match(regexp);
        if (!msgMatch.length) {
          await bot.sendMessage(chatId, 'Ссылка не распознана');
        } else {
          const cardId = msgMatch[1];
          const cardUrl = `https://api.ozon.ru/composer-api.bx/page/json/v2?url=/search/?oos_search=false&product_id=${cardId}`;

          const executablePath = await chrome.executablePath || LOCAL_CHROME_EXECUTABLE;
          const browser = await puppeteer.launch({
            executablePath,
            args: chrome.args,
            headless: false,
          });

          const page = await browser.newPage();
          await page.setUserAgent('Mozilla/5.0 (Windows NT 5.1; rv:5.0) Gecko/20100101 Firefox/5.0');
          await page.goto(cardUrl, { waitUntil: 'networkidle0' });

          let cardRaw = await page.evaluate(() => {
            return document.body.innerText;
          });
          if (cardRaw.indexOf('Access denied Error code 1020') !== -1) {
            await timeout(5000);
            await page.reload();
          }
          cardRaw = await page.evaluate(() => {
            return document.body.innerText;
          })

          try {
            const card = JSON.parse(cardRaw);
            if (card.widgetStates) {
              const widgetStates = card.widgetStates;

              const outOfStock = parseOzonData(widgetStates, 'webOutOfStock').find(el => el.sku > 0);
              if (outOfStock) {
                const txt = `Разбор карточки OZON <code>${cardId}</code>` +
                  `\n${outOfStock.sellerName} <a href="https://ozon.ru${outOfStock.productLink}">${outOfStock.skuName}</a>` +
                  `\nЦена: ${outOfStock.price}`;
                await bot.sendPhoto(chatId,
                  outOfStock.coverImage.replace('c200', 'c1000'),
                  { caption: txt, parse_mode: 'HTML', reply_to_message_id: msgId }
                );
              } else {
                const gallery = parseOzonData(widgetStates, 'webGallery')[0];
                const characteristics = parseOzonData(widgetStates, 'webCharacteristics')[0];
                const price = parseOzonData(widgetStates, 'webPrice')[0];
                const ozonAccountPrice = parseOzonData(widgetStates, 'webOzonAccountPrice')[0];
                const brand = parseOzonData(widgetStates, 'webBrand')[0];
                const heading = parseOzonData(widgetStates, 'webProductHeading')[0];
                const aspects = parseOzonData(widgetStates, 'webAspects')[0];

                const aspectsText = (aspects.aspects || []).map(el => {
                  return el.descriptionRs[0].content + el.variants.map(el => {
                    return `${el.active ? '\u2705' : '\u274c'} ${el.data.textRs[0].content}`
                  }).join(', ')
                }).join('\n');

                const txt = `Разбор карточки OZON <code>${cardId}</code>` +
                  `\n${brand && brand.name} <a href="${characteristics.link}">${heading.title}</a>` +
                  `\nЦена: ` +
                  `${price.price} ${price.originalPrice && `<s>${price.originalPrice}</s>`}` +
                  `\n${ozonAccountPrice.priceText}` +
                  `\n${aspectsText}`;

                await bot.sendPhoto(chatId,
                  gallery.coverImage,
                  { caption: txt, parse_mode: 'HTML', reply_to_message_id: msgId }
                );
              }
            }
          } catch (err) {
            console.log(err);
            // console.log(cardUrl);
            await bot.sendMessage(
              chatId,
              `Разбор карточки OZON <code>${cardId}</code> не удался`,
              {
                parse_mode: 'HTML',
                reply_to_message_id: msgId
              }
            );
          }
        }
      }

      if (msgText && msgText[0] !== "/" && msgText.indexOf(detmirUrl) !== -1) {
        console.log(`Сделан запрос ${msgText} от чат айди ${chatId}`);

        const regexp = /detmir\.ru\/product\/index\/id\/(\d*?)\//;
        const msgMatch = msgText.match(regexp);
        if (!msgMatch.length) {
          await bot.sendMessage(chatId, 'Ссылка не распознана');
        } else {
          const cardId = msgMatch[1];
          const cardUrl = `https://api.detmir.ru/v2/products/${cardId}`;
          const cardRaw = await loadPage(cardUrl);
          const card = JSON.parse(cardRaw);
          const product = card.item;

          const variants = product.variants.map(el => {
            return `${el.available.online.warehouse_codes.length ? '\u2705' : '\u274c'} ${el.title}`
          }).join(', ');

          await bot.sendPhoto(chatId,
            product.pictures[0].original,
            {
              caption:
                `Разбор карточки DETMIR <code>${cardId}</code>` +
                `\n${product.brands[0].title} <a href="${product.link.web_url}">${product.title}</a>` +
                `\nЦена: ` +
                `${product.old_price ?
                  `${formatter.format(product.price.price)} <s>${formatter.format(product.old_price.price)}</s>` :
                  `${formatter.format(product.price.price)}`
                }` +
                `${product.variants.length ? `\nВарианты: \n${variants}` : ''}` +
                `${product.available ? `\nНаличие: ${product.available.online.warehouse_codes.length ? '\u2705' : '\u274c'}` : ''}`,
              parse_mode: 'HTML',
              reply_to_message_id: msgId
            });
        }
      }
    } catch (error) {
      await bot.sendMessage(chatId, error.message.toString().slice(0, 100));
      console.log(error.message);
      // showError(error);
    }
  } else if (_req.body.callback_query) {
    const callbackQuery = _req.body.callback_query;
    const action = callbackQuery.data;
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const messageId = msg.message_id;

    console.log(`Получена команда ${action} от чат айди ${chatId}`);

    await bot.answerCallbackQuery(callbackQuery.id);
  }

  res.sendStatus(200);
});

module.exports = router;
