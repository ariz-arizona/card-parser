const router = require("express").Router();
const TelegramBot = require("node-telegram-bot-api");
const chrome = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');

const { loadPage, constructHostV2, formatter, parseOzonData, timeout } = require("../helpers");

const { TG_TOKEN, CURRENT_HOST } = process.env;
const LOCAL_CHROME_EXECUTABLE = '/usr/bin/google-chrome';

const wbUrl = 'wildberries.ru/catalog/';
const ozonUrl = 'ozon.ru/product/';

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
        // console.log(chatId);

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
