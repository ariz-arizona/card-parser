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
        if (res.status >= 400) {
            throw new Error("Bad response from server");
        }

        return await res.text();
    } catch (err) {
        console.error(err);
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

module.exports = {
    array_chunks,
    timeout,
    loadPage,
    constructHostV2,
    formatter
};
