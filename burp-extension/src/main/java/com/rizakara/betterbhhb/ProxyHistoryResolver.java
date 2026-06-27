package com.rizakara.betterbhhb;

import burp.api.montoya.http.HttpService;
import burp.api.montoya.http.message.HttpRequestResponse;
import burp.api.montoya.http.message.requests.HttpRequest;
import burp.api.montoya.proxy.ProxyHttpRequestResponse;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

final class ProxyHistoryResolver {
    private ProxyHistoryResolver() {
    }

    static List<ProxyHttpRequestResponse> matchSelected(
            List<ProxyHttpRequestResponse> history,
            List<HttpRequestResponse> selected
    ) {
        if (selected.isEmpty()) {
            return List.of();
        }

        List<ProxyHttpRequestResponse> matches = new ArrayList<>();
        Set<Integer> usedProxyIds = new HashSet<>();

        for (HttpRequestResponse selectedItem : selected) {
            ProxyHttpRequestResponse match = findMatch(history, selectedItem.request(), usedProxyIds);
            if (match != null) {
                matches.add(match);
                usedProxyIds.add(match.id());
            }
        }

        return matches;
    }

    private static ProxyHttpRequestResponse findMatch(
            List<ProxyHttpRequestResponse> history,
            HttpRequest selectedRequest,
            Set<Integer> usedProxyIds
    ) {
        for (ProxyHttpRequestResponse proxyItem : history) {
            if (usedProxyIds.contains(proxyItem.id())) {
                continue;
            }
            if (requestsMatch(selectedRequest, proxyItem.finalRequest())) {
                return proxyItem;
            }
        }
        return null;
    }

    private static boolean requestsMatch(HttpRequest selected, HttpRequest proxyRequest) {
        if (!selected.method().equals(proxyRequest.method())) {
            return false;
        }
        if (!sameHttpService(selected.httpService(), proxyRequest.httpService())) {
            return false;
        }
        if (!selected.url().equals(proxyRequest.url())) {
            return false;
        }
        return selected.toByteArray().equals(proxyRequest.toByteArray());
    }

    private static boolean sameHttpService(HttpService left, HttpService right) {
        return left.host().equals(right.host())
                && left.port() == right.port()
                && left.secure() == right.secure();
    }
}