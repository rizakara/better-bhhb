package com.rizakara.betterbhhb;

import burp.api.montoya.MontoyaApi;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

final class ExtensionLogger {
    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm:ss.SSS");
    private static final boolean DEBUG_ENABLED = isDebugEnabled();

    private final MontoyaApi api;

    ExtensionLogger(MontoyaApi api) {
        this.api = api;
    }

    void info(String message) {
        api.logging().logToOutput(prefix("INFO") + message);
    }

    void debug(String message) {
        if (!DEBUG_ENABLED) {
            return;
        }
        api.logging().logToOutput(prefix("DEBUG") + message);
    }

    void error(String message, Throwable throwable) {
        api.logging().logToError(prefix("ERROR") + message, throwable);
    }

    void error(String message) {
        api.logging().logToError(prefix("ERROR") + message);
    }

    boolean isDebugOn() {
        return DEBUG_ENABLED;
    }

    private String prefix(String level) {
        return "[Better-BHHB " + level + " " + LocalTime.now().format(TIME_FORMAT) + "] ";
    }

    private static boolean isDebugEnabled() {
        String property = System.getProperty("betterbhhb.debug", System.getenv("BETTER_BHHB_DEBUG"));
        if (property == null) {
            return true;
        }
        return !"false".equalsIgnoreCase(property) && !"0".equals(property);
    }
}