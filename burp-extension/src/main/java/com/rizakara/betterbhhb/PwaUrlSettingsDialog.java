package com.rizakara.betterbhhb;

import burp.api.montoya.ui.UserInterface;

import javax.swing.*;
import java.awt.*;

final class PwaUrlSettingsDialog {
    private PwaUrlSettingsDialog() {
    }

    static void show(Frame owner, UserInterface ui, PwaSettings settings, ExtensionLogger log) {
        log.debug("Opening PWA URL input dialog (owner=" + owner + ").");

        String message = """
                Enter the Better-BHHB address you keep open while testing.
                For local development use http://localhost:4200/

                Current: %s
                Leave blank and press Cancel to keep the current value.
                """.formatted(settings.getPwaUrl());

        JTextField urlField = new JTextField(settings.getPwaUrl(), 48);
        ui.applyThemeToComponent(urlField);

        Object[] fields = {message, urlField};
        int choice = showThemedOptionDialog(
                owner,
                ui,
                fields,
                "Better-BHHB PWA URL",
                JOptionPane.OK_CANCEL_OPTION,
                JOptionPane.PLAIN_MESSAGE
        );

        if (choice != JOptionPane.OK_OPTION) {
            log.debug("PWA URL dialog cancelled.");
            return;
        }

        String entered = urlField.getText();
        if (entered == null || entered.isBlank()) {
            log.debug("PWA URL dialog left blank; keeping current value.");
            return;
        }

        try {
            settings.setPwaUrl(entered);
            log.info("PWA URL saved: " + settings.getPwaUrl());
            showThemedMessageDialog(
                    owner,
                    ui,
                    "PWA URL saved:\n" + settings.getPwaUrl(),
                    "Better-BHHB",
                    JOptionPane.INFORMATION_MESSAGE
            );
        } catch (IllegalArgumentException exception) {
            showThemedMessageDialog(
                    owner,
                    ui,
                    exception.getMessage(),
                    "Invalid PWA URL",
                    JOptionPane.ERROR_MESSAGE
            );
        }
    }

    private static int showThemedOptionDialog(
            Frame owner,
            UserInterface ui,
            Object message,
            String title,
            int optionType,
            int messageType
    ) {
        JOptionPane pane = new JOptionPane(message, messageType, optionType);
        JDialog dialog = pane.createDialog(owner, title);
        ui.applyThemeToComponent(dialog);
        themePaneComponents(pane, ui);
        dialog.setModal(true);
        dialog.setLocationRelativeTo(owner);
        dialog.setAlwaysOnTop(true);
        dialog.setVisible(true);
        Object value = pane.getValue();
        if (!(value instanceof Integer integer)) {
            return JOptionPane.CLOSED_OPTION;
        }
        return integer;
    }

    private static void showThemedMessageDialog(
            Frame owner,
            UserInterface ui,
            String message,
            String title,
            int messageType
    ) {
        JOptionPane pane = new JOptionPane(message, messageType, JOptionPane.DEFAULT_OPTION);
        JDialog dialog = pane.createDialog(owner, title);
        ui.applyThemeToComponent(dialog);
        themePaneComponents(pane, ui);
        dialog.setModal(true);
        dialog.setLocationRelativeTo(owner);
        dialog.setAlwaysOnTop(true);
        dialog.setVisible(true);
    }

    private static void themePaneComponents(JOptionPane pane, UserInterface ui) {
        ui.applyThemeToComponent(pane);
        for (Component child : pane.getComponents()) {
            ui.applyThemeToComponent(child);
        }
    }
}