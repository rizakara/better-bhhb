package com.rizakara.betterbhhb;

import burp.api.montoya.BurpExtension;
import burp.api.montoya.MontoyaApi;
import burp.api.montoya.http.message.HttpRequestResponse;
import burp.api.montoya.proxy.ProxyHttpRequestResponse;
import burp.api.montoya.ui.UserInterface;
import burp.api.montoya.ui.contextmenu.ContextMenuEvent;
import burp.api.montoya.ui.contextmenu.ContextMenuItemsProvider;
import burp.api.montoya.ui.contextmenu.InvocationType;

import javax.swing.*;
import java.awt.*;
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

        if (isSupportedInvocation(event)) {
            List<ProxyHttpRequestResponse> history = api.proxy().history();
            List<ProxyHttpRequestResponse> selected = resolveSelectedForEvent(event, history);
            log.debug("Context menu: history=" + history.size() + ", matched selection=" + selected.size());
            menuItems.add(createSendSelectedMenuItem(selected, "context-menu"));
            menuItems.add(createSendAllMenuItem(history, "context-menu"));
            menuItems.add(new JPopupMenu.Separator());
        }

        menuItems.add(createSettingsMenuItem("context-menu"));
        return menuItems;
    }

    private void registerSuiteMenu() {
        JMenuItem sendAll = new JMenuItem("Send all proxy history to PWA");
        sendAll.addActionListener(actionEvent -> {
            log.debug("Top menu action clicked: Send all proxy history to PWA");
            sendAllFromMenu();
        });

        JMenuItem configurePwa = new JMenuItem("Configure PWA URL…");
        configurePwa.addActionListener(actionEvent -> openPwaSettingsDialog("menu", eventSource(actionEvent)));

        JMenu menu = new JMenu("Better-BHHB");
        menu.add(sendAll);
        menu.add(configurePwa);
        api.userInterface().menuBar().registerMenu(menu);
        log.debug("Registered top-level Better-BHHB menu.");
    }

    private void sendAllFromMenu() {
        List<ProxyHttpRequestResponse> items = api.proxy().history();
        log.debug("Menu send-all requested. proxy.history() size=" + items.size());

        if (items.isEmpty()) {
            showMessage("No proxy history items are available to export.", "Better-BHHB", JOptionPane.WARNING_MESSAGE);
            return;
        }

        sendToPwaAsync(items, "menu-send-all");
    }

    private JMenuItem createSendSelectedMenuItem(List<ProxyHttpRequestResponse> items, String source) {
        String label = items.size() == 1
                ? "Send selected to Better-BHHB PWA"
                : "Send selected (" + items.size() + " items) to Better-BHHB PWA";
        if (items.isEmpty()) {
            label = "Send selected to Better-BHHB PWA";
        }

        JMenuItem menuItem = new JMenuItem(label);
        menuItem.setEnabled(!items.isEmpty());
        menuItem.addActionListener(actionEvent -> {
            log.debug(source + " send-selected clicked for " + items.size() + " item(s).");
            sendToPwaAsync(items, source + "-send-selected");
        });
        return menuItem;
    }

    private JMenuItem createSendAllMenuItem(List<ProxyHttpRequestResponse> history, String source) {
        String label = history.isEmpty()
                ? "Send all to Better-BHHB PWA"
                : "Send all (" + history.size() + " items) to Better-BHHB PWA";

        JMenuItem menuItem = new JMenuItem(label);
        menuItem.setEnabled(!history.isEmpty());
        menuItem.addActionListener(actionEvent -> {
            log.debug(source + " send-all clicked for " + history.size() + " item(s).");
            sendToPwaAsync(history, source + "-send-all");
        });
        return menuItem;
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

    private List<ProxyHttpRequestResponse> resolveSelectedForEvent(
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

    private boolean isSupportedInvocation(ContextMenuEvent event) {
        return event.isFrom(
                InvocationType.PROXY_HISTORY,
                InvocationType.PROXY_INTERCEPT
        );
    }

    private void sendToPwaAsync(List<ProxyHttpRequestResponse> items, String source) {
        if (items.isEmpty()) {
            showMessage("No proxy history items are available to export.", "Better-BHHB", JOptionPane.WARNING_MESSAGE);
            return;
        }

        log.info("Queueing send from " + source + " on background thread...");
        log.info("Using PWA URL: " + pwaSettings.getPwaUrl());
        log.info("Exporting " + items.size() + " item(s). Watch this Output tab for progress.");

        sendExecutor.submit(() -> {
            try {
                log.debug("Background send started on thread " + Thread.currentThread().getName());
                coordinator.send(api, items);
                log.info("Send flow finished successfully. Browser open was requested — check Output for the import URL if needed.");
            } catch (Exception exception) {
                log.error("Send flow failed.", exception);
                showMessage(
                        "Failed to send proxy history to Better-BHHB.\n" + exception.getMessage(),
                        "Better-BHHB",
                        JOptionPane.ERROR_MESSAGE
                );
            }
        });
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