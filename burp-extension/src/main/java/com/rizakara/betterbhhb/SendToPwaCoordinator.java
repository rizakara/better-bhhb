package com.rizakara.betterbhhb;

import burp.api.montoya.MontoyaApi;
import burp.api.montoya.proxy.ProxyHttpRequestResponse;

import java.awt.Toolkit;
import java.awt.datatransfer.StringSelection;
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

        log.debug("PWA target URL: " + settings.getPwaUrl());
        log.debug("Starting temporary localhost import server...");
        TemporaryImportServer importServer = TemporaryImportServer.start(settings.getPwaUrl(), xml, log);
        int port = importServer.port();

        verifyHealth(port, log);
        copyPortToClipboard(port, log);

        log.info("Import server ready on localhost:" + port + ".");
        log.info("Keep Better-BHHB open — it listens for Burp and imports automatically.");
        log.info("Server stays up for ~" + TemporaryImportServer.autoShutdownSeconds() + " seconds.");
        log.info("Data URL: http://127.0.0.1:" + port + "/data");
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

    private void copyPortToClipboard(int port, ExtensionLogger log) {
        try {
            Toolkit.getDefaultToolkit().getSystemClipboard()
                    .setContents(new StringSelection(Integer.toString(port)), null);
            log.debug("Copied import port " + port + " to clipboard.");
        } catch (Exception exception) {
            log.debug("Could not copy port to clipboard: " + exception.getMessage());
        }
    }
}