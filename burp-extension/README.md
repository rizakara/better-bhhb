# Better-BHHB Burp Extension

Burp Suite extension that sends Proxy HTTP history, Target sitemap, Logger, and Intruder attack results to the [Better-BHHB](https://better-bhhb.pages.dev) PWA over a short-lived localhost server.

## Build

```bash
cd burp-extension
./gradlew jar
```

The extension JAR is written to `build/libs/better-bhhb-1.2.0.jar`.

Use the included Gradle wrapper (`./gradlew`), not the system `gradle` command. Ubuntu's packaged Gradle (4.x) is too old for this project.

## Install

1. Open Burp Suite → **Extensions** → **Installed** → **Add**
2. Select **Extension type: Java**
3. Choose the built JAR file

## Usage

1. Keep Better-BHHB open (installed PWA or dev server)
2. From **Proxy → HTTP history**, **Target → Sitemap**, **Logger**, or **Intruder → attack results**, select items and right-click → **Extensions → Send selected…**
3. For proxy history and sitemap you can also use **Send all…** without selecting rows first.

Burp starts a temporary server on `localhost:19876`–`19886`, exports the XML, and waits for the app to pull it. **Burp does not open any browser.**

The PWA polls those ports automatically and imports within a couple of seconds.

For Intruder and Logger, select the rows you want (Ctrl+A to select all visible rows) before sending — Burp's API only exposes the current selection, not the full results list.

You can also use the top menu bar: **Better-BHHB → Send all proxy history to PWA** or **Send all sitemap to PWA**.

## Debugging

Open **Extensions → Installed → Better-BHHB → Output** and click the send action. You should see timestamped `INFO` and `DEBUG` lines for every step:

- menu click received
- XML export size and duration
- localhost port binding
- `/health` and `/data` requests
- server shutdown

To reduce log noise:

```bash
export BETTER_BHHB_DEBUG=false
```

## PWA URL configuration

Use either:

1. **In Burp:** Proxy → HTTP history, Target → Sitemap, Logger, or Intruder → attack results → right-click → **Extensions → Configure PWA URL…**
2. **Top menu:** **Better-BHHB → Configure PWA URL…**

For local Angular dev, set:

```text
http://localhost:4200/
```

The value is saved in Burp's extension preferences and survives restarts.

Environment variables still work as a fallback when no saved value exists:

```bash
export BETTER_BHHB_PWA_URL=http://localhost:4200/
```