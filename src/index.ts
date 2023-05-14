import { ApnsClient, Notification } from "apns2";
import checkNull from "./utils/checkNull";
import { customAlphabet } from "nanoid";
import qr from "qr-image";

const nanoid = customAlphabet(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", 22
);
const SIGNING_KEY =
  `-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg4vtC3g5L5HgKGJ2+
T1eA0tOivREvEAY2g+juRXJkYL2gCgYIKoZIzj0DAQehRANCAASmOs3JkSyoGEWZ
sUGxFs/4pw1rIlSV2IC19M8u3G5kq36upOwyFWj9Gi3Ejc9d3sC7+SHRqXrEAJow
8/7tRpV+
-----END PRIVATE KEY-----`;

type DevicesDB = {
  id: number;
  key: string;
  token: string;
};

export interface Env {
  deviceToken: string;
  DB: D1Database;
};

const getTimestamp = (): number => Math.floor(Date.now() / 1000);

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const cache = caches.default;
    const { origin, pathname, searchParams } = new URL(request.url);

    // QR Code
    if (pathname === "/") {
      const qr_png = qr.imageSync(origin);
      // br 压缩
      return new Response(qr_png, { headers: { "Content-Type": "image/png", "Content-Encoding": "gzip" } });
    }
    // /favicon.ico
    if (pathname === "/favicon.ico") {
      return new Response(null);
    }

    // misc
    if (pathname === "/ping") {
      return new Response(JSON.stringify({
        code: 200,
        message: "pong",
        timestamp: getTimestamp(),
      }));
    } else if (pathname === "healthz") {
      return new Response("ok");
    } else if (pathname === "/info") {
      return new Response(JSON.stringify({
        version: "",
        build: "",
        arch: "",
        commit: "",
        devices: 0,
      }));
    }

    // register
    if (pathname === "/register") {
      let key: string = searchParams.get("key") as string;
      const deviceToken = searchParams.get("devicetoken") as string;

      if ((checkNull([key, deviceToken]) && key !== "") || (!/^[a-z0-9]{64}$/.test(deviceToken) && deviceToken !== "deleted")) {
        return new Response(JSON.stringify({
          code: 400,
          message: "missing parameter",
          timestamp: getTimestamp(),
        }), { status: 400 });
      }

      const cacheResp = await cache.match(origin + `/register?key=${key}&devicetoken=${deviceToken}`);
      console.log(origin + `/register?key=${key}&devicetoken=${deviceToken}`);
      if (cacheResp) {
        console.log("Cache HIT");
        return cacheResp;
      } else {
        console.log("Cache MISS");
      }

      if (deviceToken === "deleted") {
        const data = await env.DB.prepare("SELECT * FROM devices WHERE key = ?").bind(key).first<DevicesDB>();
        await cache.delete(origin + `/register?key=${data.key}&devicetoken=${data.token}`);
        if (data !== null)
          await env.DB.prepare("DELETE FROM devices WHERE key = ?").bind(key).run();
      } else {
        const data = key !== "" ? await env.DB.prepare("SELECT * FROM devices WHERE key = ?").bind(key).first<DevicesDB>() : null;

        let needAdd: boolean = true;
        if (data) {
          if (deviceToken === data.token)
            needAdd = false;
          else
            key = nanoid();
        } else if (!/^[a-zA-Z0-9]{22}$/.test(key)) {
          key = nanoid();
        }

        console.log(needAdd, key, deviceToken);
        if (needAdd) {
          await env.DB.prepare("DELETE FROM devices WHERE token = ?").bind(deviceToken).run();
          await env.DB.prepare("INSERT INTO devices (key, token) VALUES (?,?)").bind(key, deviceToken).run();
        }
      }

      const resp = new Response(JSON.stringify({
        code: 200,
        message: "success",
        data: {
          key: key,
          device_key: key,
          device_token: deviceToken,
        },
        timestamp: getTimestamp(),
      }));
      console.log(deviceToken !== "deleted", origin + `/register?key=${key}&devicetoken=${deviceToken}`);
      if (deviceToken !== "deleted")
        ctx.waitUntil(cache.put(origin + `/register?key=${key}&devicetoken=${deviceToken}`, resp.clone()));

      return resp;
    }

    if (pathname === "/push") {
      const client = new ApnsClient({
        team: `5U8LBRXG3A`,
        keyId: `LH4T9V5U4R`,
        signingKey: SIGNING_KEY,
        defaultTopic: "me.fin.bark",
      });

      const bn = new Notification(env.deviceToken, { alert: 'Hello, World' });

      try {
        await client.send(bn);
      } catch (err: any) {
        console.error(err.reason);
      }
    }

    return new Response("Hello World!");
  },
};
