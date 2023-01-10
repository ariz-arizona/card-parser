const fetch = require('@vercel/fetch')(require('cross-fetch'));

const array_chunks = (array, chunk_size) =>
    Array(Math.ceil(array.length / chunk_size))
        .fill()
        .map((_, index) => index * chunk_size)
        .map((begin) => array.slice(begin, begin + chunk_size));

const timeout = (ms) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};
const loadPage = async (url) => {
    if (!url) {
        return false;
    }
    try {
        const res = await fetch(url);
        const resText = await res.text();
        if (res.status >= 400) {
            let resJson = false;
            try {
                resJson = JSON.parse(resText);
            } catch (e) { }
            if (!resJson && !resJson.pageInfo) {
                // console.log({url, resText});
                throw new Error("Bad response from server");
            }
        }

        return resText;
    } catch (err) {
        console.error(err);
        throw new Error(err.message.toString().slice(0, 100));
    }
};

const host = (t) => t >= 0 && t <= 143 ? "//basket-01.wb.ru/" : t >= 144 && t <= 287 ? "//basket-02.wb.ru/" : t >= 288 && t <= 431 ? "//basket-03.wb.ru/" : t >= 432 && t <= 719 ? "//basket-04.wb.ru/" : t >= 720 && t <= 1007 ? "//basket-05.wb.ru/" : t >= 1008 && t <= 1061 ? "//basket-06.wb.ru/" : t >= 1062 && t <= 1115 ? "//basket-07.wb.ru/" : t >= 1116 && t <= 1169 ? "//basket-08.wb.ru/" : t >= 1170 && t <= 1313 ? "//basket-09.wb.ru/" : t >= 1314 && t <= 1601 ? "//basket-10.wb.ru/" : "//basket-11.wb.ru/"
const constructHostV2 = (t) => {
    const e = parseInt(t, 10)
        , n = ~~(e / 1e5)
        , r = ~~(e / 1e3)
        , o = host(n);
    return "".concat(o, "vol").concat(n, "/part").concat(r, "/").concat(e)
}

const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'RUB',

    // These options are needed to round to whole numbers if that's what you want.
    //minimumFractionDigits: 0, // (this suffices for whole numbers, but will print 2500.10 as $2,500.1)
    //maximumFractionDigits: 0, // (causes 2500.99 to be printed as $2,501)
});

const parseOzonData = (widgetStates, key) => {
    const keys = Object.keys(widgetStates).filter(el => el.indexOf(key) !== -1);
    const res = [];
    keys.map(key => {
        try {
            res.push(JSON.parse(widgetStates[key]))
        } catch (err) { }
    });
    return res.length > 0 ? res : false;
}

const getRandomInt = (min, max) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    // Максимум не включается, минимум включается
    return Math.floor(Math.random() * (max - min)) + min;
}

const sortFunc = (a, b) => {
    const aMin = Math.min(a.averagePrice, a.priceU, a.salePriceU);
    const aMax = Math.max(a.averagePrice, a.priceU, a.salePriceU);
    const aCoef = aMin / aMax;

    const bMin = Math.min(b.averagePrice, b.priceU, b.salePriceU);
    const bMax = Math.max(b.averagePrice, b.priceU, b.salePriceU);
    const bCoef = bMin / bMax;

    // товар А - 500/1000 - 0,5
    // товар Б - 750/1000 - 0,75
    // НАДО А перед Б
    return aCoef - bCoef;
};

const prepareRedisGet = raw => {
    const savedIDStr = raw !== null ? Buffer.from(raw, 'base64').toString() : JSON.stringify([0]);
    let savedIDArr = JSON.parse(savedIDStr);
    if (typeof savedIDArr === 'number') savedIDArr = [savedIDArr];
    return savedIDArr;
}

module.exports = {
    array_chunks,
    timeout,
    loadPage,
    constructHostV2,
    formatter,
    parseOzonData,
    getRandomInt,
    sortFunc,
    prepareRedisGet,
};
