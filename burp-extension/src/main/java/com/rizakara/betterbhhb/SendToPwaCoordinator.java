package com.rizakara.betterbhhb;

import burp.api.montoya.MontoyaApi;
import burp.api.montoya.proxy.ProxyHttpRequestResponse;

import java.awt.*;
import java.io.IOException;
import java.net.URI;
import java.util.List;

final class SendToPwaCoordinator {
    private final PwaSettings settings;

    SendToPwaCoordinator(PwaSettings settings) {
        this.settings = settings;
    }

    void send(MontoyaApi api, List<ProxyHttpRequestResponse> items) throws IOException {
        ExtensionLogger log = new ExtensionLogger(api);
        log.info("Send started with " + items.size() + " proxy item(s).");

        if (items.isEmpty()) {
            throw new IOException("No proxy history items to export.");
        }

        long exportStarted = System.currentTimeMillis();
        log.debug("Building Burp XML export...");
        String xml = BurpXmlExporter.export(api, items, log);
        log.info("XML export complete in " + (System.currentTimeMillis() - exportStarted) + "ms, size="
                + xml.length() + " chars (" + xml.getBytes().length + " bytes).");

        String pwaUrl = settings.getPwaUrl();
        log.debug("PWA target URL: " + pwaUrl);

        log.debug("Starting temporary localhost import server...");
        TemporaryImportServer importServer = TemporaryImportServer.start(pwaUrl, xml, log);
        String importUrl = importServer.importUrl();
        String dataUrl = importServer.dataUrl();

        log.info("Import server ready on port " + importServer.port() + ".");
        log.info("Import URL: " + importUrl);
        log.info("Data URL:  " + dataUrl);
        log.debug("Server will auto-stop after first /data fetch or in ~25 seconds.");
        verifyHealth(importServer.port(), log);

        try {
            openBrowser(importUrl, log);
            log.info("Browser open requested. Waiting for PWA to fetch " + dataUrl);
        } catch (IOException browserError) {
            log.error("Browser could not be opened automatically.", browserError);
            throw new IOException(
                    "Import server is running on port " + importServer.port()
                            + " but the browser could not be opened.\n"
                            + "Open this URL manually:\n" + importUrl,
                    browserError
            );
        }
    }

    private void verifyHealth(int port, ExtensionLogger log) throws IOException {
        String healthUrl = "http://127.0.0.1:" + port + "/health";
        log.debug("Health check: " + healthUrl);
        java.net.HttpURLConnection connection = (java.net.HttpURLConnection) URI.create(healthUrl).toURL().openConnection();
        connection.setConnectTimeout(2000);
        connection.setReadTimeout(2000);
        connection.setRequestMethod("GET");
        int status = connection.getResponseCode();
        if (status != 200) {
            throw new IOException("Import server health check failed with HTTP " + status);
        }
        log.debug("Health check OK.");
    }

    private void openBrowser(String url, ExtensionLogger log) throws IOException {
        log.debug("Attempting Desktop.browse() for " + url);

        if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
            try {
                Desktop.getDesktop().browse(new URI(url));
                log.debug("Desktop.browse() succeeded.");
                return;
            } catch (Exception exception) {
                log.debug("Desktop.browse() failed: " + exception.getMessage());
            }
        } else {
            log.debug("Desktop.browse() is not supported on this platform.");
        }

        String osName = System.getProperty("os.name", "").toLowerCase();
        ProcessBuilder processBuilder;
        if (osName.contains("mac")) {
            processBuilder = new ProcessBuilder("open", url);
        } else if (osName.contains("win")) {
            processBuilder = new ProcessBuilder("rundll32", "url.dll,FileProtocolHandler", url);
        } else {
            processBuilder = new ProcessBuilder("xdg-open", url);
        }

        log.debug("Falling back to process launcher: " + String.join(" ", processBuilder.command()));
        Process process = processBuilder.start();
        log.debug("Fallback browser process started, pid=" + process.pid());
    }
}