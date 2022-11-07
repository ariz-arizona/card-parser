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

module.exports = {
    array_chunks,
    timeout,
    loadPage
};
