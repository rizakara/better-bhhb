package com.rizakara.betterbhhb;

import burp.api.montoya.MontoyaApi;

import java.net.URI;

final class PwaSettings {
    static final String PREF_KEY = "pwaUrl";
    static final String DEFAULT_PWA_URL = "https://better-bhhb.pages.dev/";

    private final MontoyaApi api;

    PwaSettings(MontoyaApi api) {
        this.api = api;
    }

    String getPwaUrl() {
        String persisted = api.persistence().preferences().getString(PREF_KEY);
        if (persisted != null && !persisted.isBlank()) {
            return normalize(persisted);
        }

        String fromProperty = System.getProperty("betterbhhb.pwa.url");
        if (fromProperty != null && !fromProperty.isBlank()) {
            return normalize(fromProperty);
        }

        String fromEnv = System.getenv("BETTER_BHHB_PWA_URL");
        if (fromEnv != null && !fromEnv.isBlank()) {
            return normalize(fromEnv);
        }

        return DEFAULT_PWA_URL;
    }

    void setPwaUrl(String url) {
        api.persistence().preferences().setString(PREF_KEY, normalize(validate(url)));
    }

    void resetPwaUrl() {
        api.persistence().preferences().deleteString(PREF_KEY);
    }

    boolean hasCustomPwaUrl() {
        String persisted = api.persistence().preferences().getString(PREF_KEY);
        return persisted != null && !persisted.isBlank();
    }

    String normalize(String url) {
        String trimmed = url.trim();
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException("PWA URL cannot be empty.");
        }
        return trimmed.endsWith("/") ? trimmed : trimmed + "/";
    }

    private String validate(String url) {
        String normalized = normalize(url);
        try {
            URI uri = URI.create(normalized);
            if (uri.getScheme() == null || (!uri.getScheme().equals("http") && !uri.getScheme().equals("https"))) {
                throw new IllegalArgumentException("PWA URL must start with http:// or https://");
            }
            if (uri.getHost() == null || uri.getHost().isBlank()) {
                throw new IllegalArgumentException("PWA URL must include a host, e.g. http://localhost:4200/");
            }
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("PWA URL is not valid: " + url, exception);
        }
        return normalized;
    }
}