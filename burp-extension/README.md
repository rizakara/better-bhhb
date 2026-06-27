# Better-BHHB Burp Extension

Burp Suite extension that sends Proxy HTTP history to the [Better-BHHB](https://better-bhhb.pages.dev) PWA over a short-lived localhost server.

## Build

```bash
cd burp-extension
./gradlew jar
```

The extension JAR is written to `build/libs/better-bhhb-1.0.0.jar`.

Use the included Gradle wrapper (`./gradlew`), not the system `gradle` command. Ubuntu's packaged Gradle (4.x) is too old for this project.

## Install

1. Open Burp Suite → **Extensions** → **Installed** → **Add**
2. Select **Extension type: Java**
3. Choose the built JAR file

## Usage

1. Open **Proxy → HTTP history**
2. Select one or more items (or none to send the full history)
3. Right-click the table and choose **Extensions → Send to Better-BHHB PWA**

You can also use the top menu bar: **Better-BHHB → Send selected/all proxy history to PWA**.

Burp starts a temporary server on `http://127.0.0.1:19876` (or another free port), opens your browser, and the PWA fetches the XML from `/data`.

## Debugging

Open **Extensions → Installed → Better-BHHB → Output** and click the send action. You should see timestamped `INFO` and `DEBUG` lines for every step:

- menu click received
- XML export size and duration
- localhost port binding
- `/import` and `/data` requests
- browser launch attempt
- server shutdown

To reduce log noise:

```bash
export BETTER_BHHB_DEBUG=false
```

## PWA URL configuration

Use either:

1. **In Burp:** Proxy → HTTP history → right-click → **Extensions → Configure PWA URL…**
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