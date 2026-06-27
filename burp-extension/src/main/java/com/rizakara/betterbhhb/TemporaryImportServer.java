package com.rizakara.betterbhhb;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

final class TemporaryImportServer implements AutoCloseable {
    static final int PREFERRED_PORT = 19876;
    static final int CANDIDATE_PORT_COUNT = 11;
    private static final AtomicReference<TemporaryImportServer> ACTIVE_SERVER = new AtomicReference<>();
    private static final int AUTO_SHUTDOWN_SECONDS = 90;

    private final ServerSocket serverSocket;
    private final int port;
    private final String pwaUrl;
    private final byte[] xmlPayload;
    private final ExtensionLogger log;
    private final AtomicBoolean fetched = new AtomicBoolean(false);
    private final AtomicBoolean closed = new AtomicBoolean(false);
    private final ExecutorService workers = Executors.newCachedThreadPool(runnable -> {
        Thread thread = new Thread(runnable, "better-bhhb-http-worker");
        thread.setDaemon(true);
        return thread;
    });
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "better-bhhb-import-server");
        thread.setDaemon(true);
        return thread;
    });
    private final Thread acceptThread;
    private ScheduledFuture<?> shutdownTask;

    private TemporaryImportServer(
            ServerSocket serverSocket,
            int port,
            String pwaUrl,
            byte[] xmlPayload,
            ExtensionLogger log
    ) {
        this.serverSocket = serverSocket;
        this.port = port;
        this.pwaUrl = pwaUrl;
        this.xmlPayload = xmlPayload;
        this.log = log;
        this.acceptThread = new Thread(this::acceptLoop, "better-bhhb-accept");
        this.acceptThread.setDaemon(true);
    }

    static TemporaryImportServer start(String pwaUrl, String xml, ExtensionLogger log) throws IOException {
        closeActiveServer(log);

        byte[] payload = xml.getBytes(StandardCharsets.UTF_8);
        IOException lastError = null;

        for (int candidatePort : buildCandidatePorts()) {
            try {
                log.debug("Trying to bind localhost:" + candidatePort);
                ServerSocket socket = bindServerSocket(candidatePort, log);
                TemporaryImportServer importServer = new TemporaryImportServer(socket, candidatePort, pwaUrl, payload, log);
                importServer.scheduleAutoShutdown();
                importServer.acceptThread.start();
                ACTIVE_SERVER.set(importServer);
                log.info("Import server listening on http://127.0.0.1:" + candidatePort);
                return importServer;
            } catch (IOException exception) {
                log.debug("Port " + candidatePort + " unavailable: " + exception.getMessage());
                lastError = exception;
            }
        }

        throw lastError != null
                ? lastError
                : new IOException("Unable to bind a localhost port for Better-BHHB import.");
    }

    private static void closeActiveServer(ExtensionLogger log) {
        TemporaryImportServer previous = ACTIVE_SERVER.getAndSet(null);
        if (previous == null) {
            return;
        }
        log.debug("Closing previous import server on port " + previous.port + ".");
        previous.close();
    }

    private static ServerSocket bindServerSocket(int port, ExtensionLogger log) throws IOException {
        ServerSocket socket = new ServerSocket();
        socket.setReuseAddress(true);
        socket.bind(new InetSocketAddress("127.0.0.1", port), 50);
        log.debug("ServerSocket bound on localhost:" + port);
        return socket;
    }

    int port() {
        return port;
    }

    String importUrl() {
        return "http://127.0.0.1:" + port + "/import";
    }

    String dataUrl() {
        return "http://127.0.0.1:" + port + "/data";
    }

    static int autoShutdownSeconds() {
        return AUTO_SHUTDOWN_SECONDS;
    }

    static int[] buildCandidatePorts() {
        int[] ports = new int[CANDIDATE_PORT_COUNT];
        for (int index = 0; index < ports.length; index++) {
            ports[index] = PREFERRED_PORT + index;
        }
        return ports;
    }

    private void acceptLoop() {
        log.debug("Accept loop started on port " + port + ".");
        while (!closed.get()) {
            try {
                Socket client = serverSocket.accept();
                workers.submit(() -> handleClient(client));
            } catch (SocketException exception) {
                if (!closed.get()) {
                    log.error("Import server accept loop stopped unexpectedly.", exception);
                }
                return;
            } catch (IOException exception) {
                if (!closed.get()) {
                    log.error("Import server failed to accept a connection.", exception);
                }
            }
        }
    }

    private void handleClient(Socket client) {
        try (Socket socket = client) {
            socket.setSoTimeout(5000);
            BufferedReader reader = new BufferedReader(
                    new InputStreamReader(socket.getInputStream(), StandardCharsets.ISO_8859_1)
            );
            OutputStream output = socket.getOutputStream();

            String requestLine = reader.readLine();
            if (requestLine == null || requestLine.isBlank()) {
                return;
            }

            String[] parts = requestLine.split("\\s+");
            if (parts.length < 2) {
                return;
            }

            String method = parts[0].toUpperCase();
            String path = extractPath(parts[1]);
            skipHeaders(reader);

            log.debug(path + " " + method + " from " + socket.getRemoteSocketAddress());

            if ("OPTIONS".equals(method)) {
                writeResponse(output, 204, "text/plain; charset=utf-8", new byte[0]);
                return;
            }

            switch (path) {
                case "/data" -> handleData(method, output, socket);
                case "/import" -> handleImport(method, output, socket);
                case "/fetched" -> handleFetched(method, output, socket);
                case "/health" -> handleHealth(method, output, socket);
                default -> writeResponse(output, 404, "text/plain; charset=utf-8", "Not found".getBytes(StandardCharsets.UTF_8));
            }
        } catch (IOException exception) {
            log.debug("Client connection closed: " + exception.getMessage());
        }
    }

    private void handleData(String method, OutputStream output, Socket socket) throws IOException {
        if (!"GET".equals(method)) {
            writeResponse(output, 405, "text/plain; charset=utf-8", "Method not allowed".getBytes(StandardCharsets.UTF_8));
            return;
        }
        fetched.set(true);
        log.info("/data served " + xmlPayload.length + " bytes to " + socket.getRemoteSocketAddress());
        writeResponse(output, 200, "application/xml; charset=utf-8", xmlPayload);
        scheduleShutdown(250);
    }

    private void handleImport(String method, OutputStream output, Socket socket) throws IOException {
        if (!"GET".equals(method)) {
            writeResponse(output, 405, "text/plain; charset=utf-8", "Method not allowed".getBytes(StandardCharsets.UTF_8));
            return;
        }
        String redirectTarget = pwaUrl
                + (pwaUrl.contains("?") ? "&" : "?")
                + "import=1&port=" + port;
        log.info("/import redirecting browser to " + redirectTarget);
        String html = """
                <!DOCTYPE html>
                <html lang="en">
                <head>
                  <meta charset="utf-8">
                  <title>Opening Better-BHHB…</title>
                  <meta http-equiv="refresh" content="0;url=%s">
                  <style>
                    body { font-family: sans-serif; margin: 2rem; color: #1d1e20; }
                    a { color: #177fc5; }
                  </style>
                </head>
                <body>
                  <p>Opening Better-BHHB and importing Burp proxy history…</p>
                  <p>If nothing happens, <a href="%s">open the PWA manually</a>.</p>
                  <script>window.location.replace(%s);</script>
                </body>
                </html>
                """.formatted(redirectTarget, redirectTarget, jsonString(redirectTarget));
        writeResponse(output, 200, "text/html; charset=utf-8", html.getBytes(StandardCharsets.UTF_8));
    }

    private void handleFetched(String method, OutputStream output, Socket socket) throws IOException {
        if (!"GET".equals(method) && !"POST".equals(method)) {
            writeResponse(output, 405, "text/plain; charset=utf-8", "Method not allowed".getBytes(StandardCharsets.UTF_8));
            return;
        }
        fetched.set(true);
        log.info("/fetched called — shutting down import server.");
        writeResponse(output, 200, "text/plain; charset=utf-8", "ok".getBytes(StandardCharsets.UTF_8));
        scheduleShutdown(0);
    }

    private void handleHealth(String method, OutputStream output, Socket socket) throws IOException {
        if (!"GET".equals(method)) {
            writeResponse(output, 405, "text/plain; charset=utf-8", "Method not allowed".getBytes(StandardCharsets.UTF_8));
            return;
        }
        String body = "{\"ready\":true,\"port\":" + port + "}";
        writeResponse(output, 200, "application/json; charset=utf-8", body.getBytes(StandardCharsets.UTF_8));
    }

    private static String extractPath(String target) {
        try {
            return URI.create(target).getPath();
        } catch (IllegalArgumentException exception) {
            int queryIndex = target.indexOf('?');
            return queryIndex >= 0 ? target.substring(0, queryIndex) : target;
        }
    }

    private static void skipHeaders(BufferedReader reader) throws IOException {
        String line;
        while ((line = reader.readLine()) != null && !line.isEmpty()) {
            // discard request headers
        }
    }

    private static void writeResponse(OutputStream output, int status, String contentType, byte[] body) throws IOException {
        String statusText = switch (status) {
            case 200 -> "OK";
            case 204 -> "No Content";
            case 404 -> "Not Found";
            case 405 -> "Method Not Allowed";
            default -> "OK";
        };

        String headers = "HTTP/1.1 " + status + " " + statusText + "\r\n"
                + "Content-Type: " + contentType + "\r\n"
                + "Access-Control-Allow-Origin: *\r\n"
                + "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
                + "Access-Control-Allow-Headers: Content-Type\r\n"
                + "Connection: close\r\n"
                + "Cache-Control: no-store\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "\r\n";
        output.write(headers.getBytes(StandardCharsets.US_ASCII));
        if (body.length > 0) {
            output.write(body);
        }
        output.flush();
    }

    private void scheduleAutoShutdown() {
        log.debug("Scheduled auto-shutdown in " + AUTO_SHUTDOWN_SECONDS + " seconds.");
        shutdownTask = scheduler.schedule(this::closeQuietly, AUTO_SHUTDOWN_SECONDS, TimeUnit.SECONDS);
    }

    private void scheduleShutdown(long delayMs) {
        log.debug("Scheduled shutdown in " + delayMs + "ms.");
        if (shutdownTask != null) {
            shutdownTask.cancel(false);
        }
        shutdownTask = scheduler.schedule(this::closeQuietly, delayMs, TimeUnit.MILLISECONDS);
    }

    private void closeQuietly() {
        try {
            log.info("Stopping temporary import server on port " + port
                    + " (fetched=" + fetched.get() + ").");
            close();
        } catch (Exception exception) {
            log.error("Failed to stop import server cleanly.", exception);
        }
    }

    @Override
    public void close() {
        if (!closed.compareAndSet(false, true)) {
            return;
        }
        ACTIVE_SERVER.compareAndSet(this, null);
        if (shutdownTask != null) {
            shutdownTask.cancel(false);
        }
        try {
            serverSocket.close();
        } catch (IOException exception) {
            log.debug("ServerSocket close: " + exception.getMessage());
        }
        workers.shutdownNow();
        scheduler.shutdownNow();
    }

    private static String jsonString(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }
}