import {send, buffer} from "micro";
import {scheduler} from "node:timers/promises";

let requests = 0;

const {
    FLY_APP_NAME,
    RENDER_EXTERNAL_URL = FLY_APP_NAME ? `https://${FLY_APP_NAME}.fly.dev` : "http://localhost"
} = process.env;

const ignoredHeaders = ["host", "connection", "content-length"];

const isValidHeader = ([header, value]) => {
    if (ignoredHeaders.includes(header.toLowerCase())) return;
    if (typeof value !== "string") return;
    return true;
}

const example = `Example: ${RENDER_EXTERNAL_URL}/api.ipify.org`;

const sanitizeURL = url => url.startsWith("http") ? url : `http://${url}`;

const sanitizeHeaders = headers => {
    return Object.fromEntries(Object.entries(headers).filter(isValidHeader));
}

const getBody = async req => {
    if (req.method.toLowerCase() !== "post") return;
    return new Blob([await buffer(req)]);
}

const proxyRequest = async (req, res, id) => {
    const {method} = req;
    const time = Date.now();
    if (req.url === "/") return example;
    const headers = sanitizeHeaders(req.headers);
    const url = new URL(sanitizeURL(req.url.slice(1)));
    console.log(`[${id}]`, method, url.href);
    const body = await getBody(req);
    const response = await fetch(url, {method, body, headers});
    const data = await response.text();
    console.log(`[${id}]`, method, url.href, response.statusText, "—", Date.now() - time, "ms");
    console.log(`[${id}]`, "Response:", data);
    if (!response.ok) return send(res, response.status, data);
    return data;
}

export default async (req, res) => {
    const id = ++requests;
    try {
        const text = "Request prolonged ...";
        const controller = new AbortController();
        const {signal} = controller;
        const timeout = scheduler.wait(50_000, {signal}).then(() => console.log(`[${id}]`, text) || text);
        const result = await Promise.race([timeout, proxyRequest(req, res, id)]);
        controller.abort("Request complete !");
        return result;
    } catch (e) {
        console.error(`[${id}]`, "Error:", e.message || "");
        console.error(e);
        return send(res, 500, e.message || e);
    }
};
