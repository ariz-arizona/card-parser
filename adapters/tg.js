const router = require("express").Router();
const TelegramBot = require("node-telegram-bot-api");
const { loadPage } = require("../helpers");

// const { array_chunks, timeout, formatBytes } = require("../helpers");

const { TG_TOKEN, CURRENT_HOST } = process.env;

const wbUrl = 'https://www.wildberries.ru/catalog/';

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
    const chatId = _req.body.message.chat.id;
    // const date = _req.body.message.date;

    console.log(`Сделан запрос ${msgText} от чат айди ${chatId}`);
    try {
      if (msgText && msgText[0] !== "/" && msgText.indexOf(wbUrl) !== -1) {
        const regexp = /www\.wildberries\.ru\/catalog\/(\d*)/;
        const msgMatch = msgText.match(regexp);
        if (!msgMatch.length) {
          await bot.sendMessage(chatId, 'Ссылка не распознана');
        } else {
          const cardId = msgMatch[1];
          const cardUrl = `https://card.wb.ru/cards/detail?dest=-1059500,-72639,-3826860,-5551776&nm=${cardId}`;
          const cardRaw = await loadPage(cardUrl);
          const card = JSON.parse(cardRaw);
          const product = card.data.products[0];
          
          await bot.sendMessage(chatId,
            `Разбор карточки WB <code>${cardId}</code>
          \n<a href="${wbUrl}${cardId}/detail.aspx">${product.name}</a>
          \nБренд: ${product.brand}
          \nРазмеры: \n${product.sizes.map(el =>
              `    ${el.stocks.length ? '\u2705' : '\u274c'} ${el.name}`
            ).join('\n')}`
            , { parse_mode: 'HTML' });
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
