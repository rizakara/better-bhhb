package com.rizakara.betterbhhb;

import burp.api.montoya.BurpExtension;
import burp.api.montoya.MontoyaApi;
import burp.api.montoya.core.ToolType;
import burp.api.montoya.http.message.HttpRequestResponse;
import burp.api.montoya.proxy.ProxyHttpRequestResponse;
import burp.api.montoya.ui.UserInterface;
import burp.api.montoya.ui.contextmenu.ContextMenuEvent;
import burp.api.montoya.ui.contextmenu.ContextMenuItemsProvider;
import burp.api.montoya.ui.contextmenu.InvocationType;

import javax.swing.*;
import java.awt.*;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class BetterBhhbExtension implements BurpExtension, ContextMenuItemsProvider {
    private MontoyaApi api;
    private ExtensionLogger log;
    private PwaSettings pwaSettings;
    private SendToPwaCoordinator coordinator;
    private final ExecutorService sendExecutor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "better-bhhb-send-worker");
        thread.setDaemon(true);
        return thread;
    });

    @Override
    public void initialize(MontoyaApi api) {
        this.api = api;
        this.log = new ExtensionLogger(api);
        this.pwaSettings = new PwaSettings(api);
        this.coordinator = new SendToPwaCoordinator(pwaSettings);

        api.extension().setName("Better-BHHB");
        api.userInterface().registerContextMenuItemsProvider(this);
        registerSuiteMenu();

        log.info("Extension loaded (debug logging is ON by default).");
        log.info("Current PWA URL: " + pwaSettings.getPwaUrl()
                + (pwaSettings.hasCustomPwaUrl() ? " (custom)" : " (default)"));
        log.info("Use Extensions -> Configure PWA URL to point at localhost during development.");
        log.info("Watch this Output tab while testing. Set BETTER_BHHB_DEBUG=false to reduce noise.");
    }

    @Override
    public List<Component> provideMenuItems(ContextMenuEvent event) {
        log.debug("Context menu requested. invocationType=" + event.invocationType()
                + ", toolType=" + event.toolType()
                + ", selectedCount=" + event.selectedRequestResponses().size());

        List<Component> menuItems = new ArrayList<>();

        if (isProxyInvocation(event)) {
            List<ProxyHttpRequestResponse> history = api.proxy().history();
            List<ProxyHttpRequestResponse> selected = resolveSelectedProxyItems(event, history);
            log.debug("Context menu: history=" + history.size() + ", matched selection=" + selected.size());
            menuItems.add(createSendSelectedProxyMenuItem(selected, "context-menu"));
            menuItems.add(createSendAllProxyMenuItem(history, "context-menu"));
            menuItems.add(new JPopupMenu.Separator());
        } else if (isIntruderResultsInvocation(event)) {
            List<HttpRequestResponse> selected = event.selectedRequestResponses();
            log.debug("Context menu: intruder selection=" + selected.size());
            menuItems.add(createSendSelectedHttpMenuItem(
                    selected,
                    "context-menu",
                    "intruder results",
                    "intruder-send-selected"
            ));
            menuItems.add(new JPopupMenu.Separator());
        } else if (isSiteMapInvocation(event)) {
            List<HttpRequestResponse> selected = event.selectedRequestResponses();
            List<HttpRequestResponse> all = api.siteMap().requestResponses();
            log.debug("Context menu: sitemap selection=" + selected.size() + ", total=" + all.size());
            menuItems.add(createSendSelectedHttpMenuItem(
                    selected,
                    "context-menu",
                    "sitemap items",
                    "sitemap-send-selected"
            ));
            menuItems.add(createSendAllHttpMenuItem(all, "context-menu", "sitemap items", "sitemap-send-all"));
            menuItems.add(new JPopupMenu.Separator());
        } else if (isLoggerInvocation(event)) {
            List<HttpRequestResponse> selected = event.selectedRequestResponses();
            log.debug("Context menu: logger selection=" + selected.size());
            menuItems.add(createSendSelectedHttpMenuItem(
                    selected,
                    "context-menu",
                    "logger items",
                    "logger-send-selected"
            ));
            menuItems.add(new JPopupMenu.Separator());
        }

        menuItems.add(createSettingsMenuItem("context-menu"));
        return menuItems;
    }

    private void registerSuiteMenu() {
        JMenuItem sendAllProxy = new JMenuItem("Send all proxy history to PWA");
        sendAllProxy.addActionListener(actionEvent -> {
            log.debug("Top menu action clicked: Send all proxy history to PWA");
            sendAllProxyFromMenu();
        });

        JMenuItem sendAllSiteMap = new JMenuItem("Send all sitemap to PWA");
        sendAllSiteMap.addActionListener(actionEvent -> {
            log.debug("Top menu action clicked: Send all sitemap to PWA");
            sendAllSiteMapFromMenu();
        });

        JMenuItem configurePwa = new JMenuItem("Configure PWA URL…");
        configurePwa.addActionListener(actionEvent -> openPwaSettingsDialog("menu", eventSource(actionEvent)));

        JMenu menu = new JMenu("Better-BHHB");
        menu.add(sendAllProxy);
        menu.add(sendAllSiteMap);
        menu.add(configurePwa);
        api.userInterface().menuBar().registerMenu(menu);
        log.debug("Registered top-level Better-BHHB menu.");
    }

    private void sendAllProxyFromMenu() {
        List<ProxyHttpRequestResponse> items = api.proxy().history();
        log.debug("Menu send-all requested. proxy.history() size=" + items.size());

        if (items.isEmpty()) {
            showMessage("No proxy history items are available to export.", "Better-BHHB", JOptionPane.WARNING_MESSAGE);
            return;
        }

        sendProxyHistoryToPwaAsync(items, "menu-send-all");
    }

    private void sendAllSiteMapFromMenu() {
        List<HttpRequestResponse> items = api.siteMap().requestResponses();
        log.debug("Menu send-all requested. siteMap.requestResponses() size=" + items.size());

        if (items.isEmpty()) {
            showMessage("No sitemap items are available to export.", "Better-BHHB", JOptionPane.WARNING_MESSAGE);
            return;
        }

        sendRequestResponsesToPwaAsync(items, "menu-send-all", "sitemap");
    }

    private JMenuItem createSendSelectedProxyMenuItem(List<ProxyHttpRequestResponse> items, String source) {
        String label = items.size() == 1
                ? "Send selected to Better-BHHB PWA"
                : "Send selected (" + items.size() + " items) to Better-BHHB PWA";
        if (items.isEmpty()) {
            label = "Send selected to Better-BHHB PWA";
        }

        JMenuItem menuItem = new JMenuItem(label);
        menuItem.setEnabled(!items.isEmpty());
        menuItem.addActionListener(actionEvent -> {
            log.debug(source + " send-selected clicked for " + items.size() + " proxy item(s).");
            sendProxyHistoryToPwaAsync(items, source + "-send-selected");
        });
        return menuItem;
    }

    private JMenuItem createSendAllProxyMenuItem(List<ProxyHttpRequestResponse> history, String source) {
        String label = history.isEmpty()
                ? "Send all to Better-BHHB PWA"
                : "Send all (" + history.size() + " items) to Better-BHHB PWA";

        JMenuItem menuItem = new JMenuItem(label);
        menuItem.setEnabled(!history.isEmpty());
        menuItem.addActionListener(actionEvent -> {
            log.debug(source + " send-all clicked for " + history.size() + " proxy item(s).");
            sendProxyHistoryToPwaAsync(history, source + "-send-all");
        });
        return menuItem;
    }

    private JMenuItem createSendSelectedHttpMenuItem(
            List<HttpRequestResponse> items,
            String source,
            String itemLabel,
            String actionSuffix
    ) {
        String label = items.size() == 1
                ? "Send selected " + itemLabel + " to Better-BHHB PWA"
                : "Send selected (" + items.size() + " " + itemLabel + ") to Better-BHHB PWA";
        if (items.isEmpty()) {
            label = "Send selected " + itemLabel + " to Better-BHHB PWA";
        }

        JMenuItem menuItem = new JMenuItem(label);
        menuItem.setEnabled(!items.isEmpty());
        menuItem.addActionListener(actionEvent -> {
            log.debug(source + " " + actionSuffix + " clicked for " + items.size() + " item(s).");
            sendRequestResponsesToPwaAsync(items, source + "-" + actionSuffix, sourceKindFromLabel(itemLabel));
        });
        return menuItem;
    }

    private JMenuItem createSendAllHttpMenuItem(
            List<HttpRequestResponse> items,
            String source,
            String itemLabel,
            String actionSuffix
    ) {
        String label = items.isEmpty()
                ? "Send all to Better-BHHB PWA"
                : "Send all (" + items.size() + " " + itemLabel + ") to Better-BHHB PWA";

        JMenuItem menuItem = new JMenuItem(label);
        menuItem.setEnabled(!items.isEmpty());
        menuItem.addActionListener(actionEvent -> {
            log.debug(source + " " + actionSuffix + " clicked for " + items.size() + " item(s).");
            sendRequestResponsesToPwaAsync(items, source + "-" + actionSuffix, "sitemap");
        });
        return menuItem;
    }

    private String sourceKindFromLabel(String itemLabel) {
        if (itemLabel.startsWith("intruder")) {
            return "intruder";
        }
        if (itemLabel.startsWith("logger")) {
            return "logger";
        }
        if (itemLabel.startsWith("sitemap")) {
            return "sitemap";
        }
        return "http";
    }

    private JMenuItem createSettingsMenuItem(String source) {
        JMenuItem menuItem = new JMenuItem("Configure PWA URL…");
        menuItem.addActionListener(actionEvent -> {
            log.debug(source + " settings action clicked.");
            openPwaSettingsDialog(source, eventSource(actionEvent));
        });
        return menuItem;
    }

    private void openPwaSettingsDialog(String source, Component invoker) {
        log.debug("Scheduling PWA URL settings dialog from " + source + ".");
        Frame owner = suiteFrame();
        UserInterface ui = api.userInterface();
        SwingUtilities.invokeLater(() -> {
            try {
                log.debug("Showing PWA URL settings dialog (owner=" + owner + ").");
                PwaUrlSettingsDialog.show(owner, ui, pwaSettings, log);
            } catch (Exception exception) {
                log.error("Failed to show PWA URL settings dialog.", exception);
                showMessage(
                        "Could not open the PWA URL settings dialog.\n" + exception.getMessage(),
                        "Better-BHHB",
                        JOptionPane.ERROR_MESSAGE
                );
            }
        });
    }

    private Frame suiteFrame() {
        return api.userInterface().swingUtils().suiteFrame();
    }

    private Component eventSource(AWTEvent event) {
        Object source = event.getSource();
        return source instanceof Component component ? component : null;
    }

    private List<ProxyHttpRequestResponse> resolveSelectedProxyItems(
            ContextMenuEvent event,
            List<ProxyHttpRequestResponse> history
    ) {
        if (history.isEmpty()) {
            return List.of();
        }

        List<HttpRequestResponse> selected = event.selectedRequestResponses();
        if (selected.isEmpty()) {
            log.debug("No items selected in proxy history.");
            return List.of();
        }

        List<ProxyHttpRequestResponse> matched = ProxyHistoryResolver.matchSelected(history, selected);
        log.debug("Matched " + matched.size() + " of " + selected.size() + " selected item(s).");
        return matched;
    }

    private boolean isProxyInvocation(ContextMenuEvent event) {
        return event.isFrom(
                InvocationType.PROXY_HISTORY,
                InvocationType.PROXY_INTERCEPT
        );
    }

    private boolean isIntruderResultsInvocation(ContextMenuEvent event) {
        return event.isFrom(InvocationType.INTRUDER_ATTACK_RESULTS);
    }

    private boolean isSiteMapInvocation(ContextMenuEvent event) {
        return event.isFrom(
                InvocationType.SITE_MAP_TREE,
                InvocationType.SITE_MAP_TABLE
        );
    }

    private boolean isLoggerInvocation(ContextMenuEvent event) {
        return event.isFromTool(ToolType.LOGGER);
    }

    private void sendProxyHistoryToPwaAsync(List<ProxyHttpRequestResponse> items, String source) {
        if (items.isEmpty()) {
            showMessage("No proxy history items are available to export.", "Better-BHHB", JOptionPane.WARNING_MESSAGE);
            return;
        }

        queueSend(source, items.size(), () -> coordinator.sendProxyHistory(api, items));
    }

    private void sendRequestResponsesToPwaAsync(List<HttpRequestResponse> items, String source, String kind) {
        if (items.isEmpty()) {
            showMessage(emptySelectionMessage(kind), "Better-BHHB", JOptionPane.WARNING_MESSAGE);
            return;
        }

        queueSend(source, items.size(), () -> coordinator.sendRequestResponses(api, items));
    }

    private String emptySelectionMessage(String kind) {
        return switch (kind) {
            case "intruder" ->
                    "No intruder results are selected.\nSelect rows in the attack results table (Ctrl+A for all), then try again.";
            case "sitemap" ->
                    "No sitemap items are selected.\nSelect rows in the sitemap table or tree (Ctrl+A for all), then try again.";
            case "logger" ->
                    "No logger items are selected.\nSelect rows in the Logger table (Ctrl+A for all), then try again.";
            default -> "No items are selected.\nSelect rows (Ctrl+A for all), then try again.";
        };
    }

    private void queueSend(String source, int itemCount, ThrowingRunnable sendTask) {
        log.info("Queueing send from " + source + " on background thread...");
        log.info("Using PWA URL: " + pwaSettings.getPwaUrl());
        log.info("Exporting " + itemCount + " item(s). Watch this Output tab for progress.");

        sendExecutor.submit(() -> {
            try {
                log.debug("Background send started on thread " + Thread.currentThread().getName());
                sendTask.run();
                log.info("Send flow finished successfully. Switch to Better-BHHB to complete the import.");
            } catch (Exception exception) {
                log.error("Send flow failed.", exception);
                showMessage(
                        "Failed to send items to Better-BHHB.\n" + exception.getMessage(),
                        "Better-BHHB",
                        JOptionPane.ERROR_MESSAGE
                );
            }
        });
    }

    @FunctionalInterface
    private interface ThrowingRunnable {
        void run() throws IOException;
    }

    private void showMessage(String message, String title, int messageType) {
        log.info(title + ": " + message.replace('\n', ' '));
        Frame owner = suiteFrame();
        UserInterface ui = api.userInterface();
        Runnable show = () -> {
            JOptionPane pane = new JOptionPane(message, messageType);
            JDialog dialog = pane.createDialog(owner, title);
            ui.applyThemeToComponent(dialog);
            dialog.setModal(false);
            dialog.setAlwaysOnTop(true);
            dialog.setLocationRelativeTo(owner);
            dialog.setVisible(true);
        };
        if (SwingUtilities.isEventDispatchThread()) {
            show.run();
            return;
        }
        SwingUtilities.invokeLater(show);
    }
}