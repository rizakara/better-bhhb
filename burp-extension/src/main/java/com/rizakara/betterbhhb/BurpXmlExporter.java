package com.rizakara.betterbhhb;

import burp.api.montoya.MontoyaApi;
import burp.api.montoya.http.HttpService;
import burp.api.montoya.http.message.MimeType;
import burp.api.montoya.http.message.requests.HttpRequest;
import burp.api.montoya.http.message.responses.HttpResponse;
import burp.api.montoya.proxy.ProxyHttpRequestResponse;

import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.List;
import java.util.Locale;

final class BurpXmlExporter {
    private static final DateTimeFormatter BURP_TIME_FORMAT =
            DateTimeFormatter.ofPattern("EEE MMM dd HH:mm:ss zzz yyyy", Locale.ENGLISH);

    private BurpXmlExporter() {
    }

    static String export(MontoyaApi api, List<ProxyHttpRequestResponse> items, ExtensionLogger log) {
        log.debug("Serializing " + items.size() + " proxy item(s) to XML.");
        StringBuilder xml = new StringBuilder(Math.max(items.size() * 2048, 4096));
        xml.append("<?xml version=\"1.0\"?>\n");
        xml.append("<items burpVersion=\"")
                .append(escapeAttribute(api.burpSuite().version().toString()))
                .append("\" exportTime=\"")
                .append(escapeAttribute(ZonedDateTime.now().format(BURP_TIME_FORMAT)))
                .append("\">\n");

        int index = 0;
        for (ProxyHttpRequestResponse item : items) {
            index++;
            try {
                appendItem(xml, item);
            } catch (Exception exception) {
                log.error("Failed to export proxy item #" + index + " (proxy id=" + item.id() + ").", exception);
                throw exception;
            }
            if (index % 100 == 0) {
                log.debug("Exported " + index + "/" + items.size() + " items...");
            }
        }

        xml.append("</items>\n");
        log.debug("Finished serializing XML for " + items.size() + " item(s).");
        return xml.toString();
    }

    private static void appendItem(StringBuilder xml, ProxyHttpRequestResponse item) {
        HttpRequest request = item.finalRequest();
        HttpService service = request.httpService();
        String protocol = service.secure() ? "https" : "http";
        String host = service.host();
        String ip = safeIp(service);
        String url = request.url();
        String path = safePath(request);
        String extension = safeExtension(request);
        String method = request.method();
        String time = item.time().format(BURP_TIME_FORMAT);
        String comment = item.annotations() != null && item.annotations().hasNotes()
                ? item.annotations().notes()
                : "";

        byte[] requestBytes = request.toByteArray().getBytes();
        String requestPayload = Base64.getEncoder().encodeToString(requestBytes);

        xml.append("  <item>\n");
        xml.append("    <time>").append(escapeText(time)).append("</time>\n");
        xml.append("    <url><![CDATA[").append(cdata(url)).append("]]></url>\n");
        xml.append("    <host ip=\"").append(escapeAttribute(ip)).append("\">")
                .append(escapeText(host))
                .append("</host>\n");
        xml.append("    <port>").append(service.port()).append("</port>\n");
        xml.append("    <protocol>").append(escapeText(protocol)).append("</protocol>\n");
        xml.append("    <method>").append(escapeText(method)).append("</method>\n");
        xml.append("    <path><![CDATA[").append(cdata(path)).append("]]></path>\n");
        xml.append("    <extension>").append(escapeText(extension)).append("</extension>\n");
        xml.append("    <request base64=\"true\"><![CDATA[")
                .append(cdata(requestPayload))
                .append("]]></request>\n");

        if (item.hasResponse()) {
            HttpResponse response = item.response();
            byte[] responseBytes = response.toByteArray().getBytes();
            String responsePayload = Base64.getEncoder().encodeToString(responseBytes);
            xml.append("    <status>").append(response.statusCode()).append("</status>\n");
            xml.append("    <responselength>").append(responseBytes.length).append("</responselength>\n");
            xml.append("    <mimetype>").append(escapeText(mapMimeType(item.mimeType()))).append("</mimetype>\n");
            xml.append("    <response base64=\"true\"><![CDATA[")
                    .append(cdata(responsePayload))
                    .append("]]></response>\n");
        } else {
            xml.append("    <status></status>\n");
            xml.append("    <responselength>0</responselength>\n");
            xml.append("    <mimetype></mimetype>\n");
            xml.append("    <response base64=\"false\"><![CDATA[]]></response>\n");
        }

        xml.append("    <comment>").append(escapeText(comment)).append("</comment>\n");
        xml.append("  </item>\n");
    }

    private static String safeIp(HttpService service) {
        try {
            return service.ipAddress();
        } catch (Exception ignored) {
            return service.host();
        }
    }

    private static String safePath(HttpRequest request) {
        try {
            return request.path();
        } catch (Exception ignored) {
            return "/";
        }
    }

    private static String safeExtension(HttpRequest request) {
        try {
            String extension = request.fileExtension();
            return extension == null || extension.isBlank() ? "null" : extension;
        } catch (Exception ignored) {
            return "null";
        }
    }

    private static String mapMimeType(MimeType mimeType) {
        if (mimeType == null || mimeType == MimeType.NONE) {
            return "";
        }
        String description = mimeType.description();
        if (description != null && !description.isBlank()) {
            return description;
        }
        return mimeType.name().toLowerCase(Locale.ROOT);
    }

    private static String escapeAttribute(String value) {
        return escapeText(value)
                .replace("\"", "&quot;");
    }

    private static String escapeText(String value) {
        if (value == null) {
            return "";
        }
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;");
    }

    private static String cdata(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("]]>", "]]]]><![CDATA[>");
    }
}