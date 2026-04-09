# DataLens Calculator

DataLens Calculator is a powerful Chrome extension that allows you to easily extract numbers from any webpage by clicking or drag-selecting elements. Extracted data can then be used to perform quick operations or custom calculations, complete with a full history log.

## Features

- **🎯 Two Selection Modes**:
  - **Click Mode** (`Alt+Shift+C` or `Cmd+Shift+C` on Mac): Click on individual elements to extract numbers instantly.
  - **Drag Mode** (`Alt+Shift+D` or `Cmd+Shift+D` on Mac): Draw a bounding box to extract all numbers within the selected area.
- **🧮 Built-in Calculator**: 
  - Quick operations: Sum, Average, Min, Max, Product, Subtract, Count, and Median.
  - Custom formulas utilizing your extracted variables (e.g., `[A] * 0.9 - [B]`).
- **📋 Paste Tab**: Manually paste tabular data (e.g., from Excel or Google Sheets) to instantly extract numbers if you cannot select them on the webpage directly.
- **🕒 Full History & Snapshots**: Automatically logs all calculations. Pin important results or save complete snapshots of your current workspace for future reference.
- **💻 Side Panel Integration**: Provides a clean and non-intrusive side panel interface ensuring it doesn't block your view of the webpage.

## Installation

Since this is an unpackaged extension, you will need to load it manually in developer mode:

1. Open your Chromium-based browser (Chrome, Edge, Brave, etc.).
2. Navigate to the extensions page by typing `chrome://extensions/` in the URL bar.
3. Enable **Developer mode** (usually a toggle in the top-right corner).
4. Click on **Load unpacked**.
5. Select the folder containing the `DataLens Calculator` source code (the directory with the `manifest.json` file).
6. The extension is now installed! **Tip:** Pin the extension to your toolbar for quick access.

## Step-by-Step Guide

### 1. Activating the Extension
Click the DataLens Calculator icon in your browser toolbar to open the **Side Panel**. All your interactions and calculations will happen here.

### 2. Extracting Data
Navigate to any webpage containing data you want to compute. You have three ways to gather data:
- **Click Mode**: Click the "Click" button in the side panel header (or use `Alt+Shift+C`). Hover over numbers on the page and click to extract them into your "Selections" tab.
- **Drag Mode**: Click the "Drag" button (or use `Alt+Shift+D`). Click and drag to create a selection box over a large area of numbers. All valid numbers inside the box will be extracted.
- **Paste Mode**: Can't select the data directly (e.g., from an image or canvas)? Go to the "Paste" tab, paste your tab-delimited data, and click "Extract Numbers".

*(Press `Esc` to cancel the active selection mode at any time.)*

### 3. Performing Calculations
1. Open the **Calculator** tab in the side panel.
2. The values you extracted will be available here. 
3. **Quick Operations:** Click on `Sum`, `Average`, `Min`, `Max`, etc., to quickly compute results based on all gathered values.
4. **Custom Formulas:** In the "Custom Formula" section, you can write specific mathematical equations referencing your selections by label (e.g., `[A] + [B] / 2`). Click `=` to evaluate.
5. Hover over the result to copy it to your clipboard or save it to your history.

### 4. Managing History
1. View past calculations in the **History** tab.
2. You can pin essential calculations to keep them easily accessible.
3. Use the "Save Snapshot" feature to save an entire state of calculations for a specific task or session.

## Shortcuts Summary

| Action | Windows / Linux | Mac |
| :--- | :--- | :--- |
| **Toggle Drag Mode** | `Alt+Shift+D` | `Cmd+Shift+D` |
| **Toggle Click Mode**| `Alt+Shift+C` | `Cmd+Shift+C` |
| **Cancel Mode**      | `Esc` | `Esc` |
