import * as vscode from 'vscode';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
  console.log('[JSON Log Viewer] Extension activated');
  
  const disposable = vscode.commands.registerCommand('jsonLogs.preview', () => {
    console.log('[JSON Log Viewer] Command executed');
    
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }

    const document = editor.document;
    const logContent = document.getText();
    const fileName = path.basename(document.fileName);
    
    console.log('[JSON Log Viewer] File:', fileName);
    console.log('[JSON Log Viewer] Content length:', logContent.length);

    // Create WebView panel
    const panel = vscode.window.createWebviewPanel(
      'jsonLogViewer',
      `Log Viewer: ${fileName}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'media')
        ]
      }
    );

    // Get URIs for resources
    const styleUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'styles.css')
    );
    const scriptUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'main.js')
    );
    
    console.log('[JSON Log Viewer] Style URI:', styleUri.toString());
    console.log('[JSON Log Viewer] Script URI:', scriptUri.toString());

    // Set WebView content
    panel.webview.html = getWebviewContent(styleUri, scriptUri, logContent, panel.webview);
    console.log('[JSON Log Viewer] WebView HTML set');

    // Handle messages from WebView
    panel.webview.onDidReceiveMessage(
      (message: { command: string; text?: string }) => {
        switch (message.command) {
          case 'error':
            vscode.window.showErrorMessage(message.text || 'Unknown error');
            break;
        }
      },
      undefined,
      context.subscriptions
    );

    // Update content when document changes
    const changeDisposable = vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
      if (e.document === document) {
        panel.webview.postMessage({
          command: 'updateLogs',
          content: e.document.getText()
        });
      }
    });

    panel.onDidDispose(() => {
      changeDisposable.dispose();
    });
  });

  context.subscriptions.push(disposable);
}

function getWebviewContent(styleUri: vscode.Uri, scriptUri: vscode.Uri, logContent: string, webview: vscode.Webview): string {
  // Escape the log content for embedding in HTML
  const escapedContent = logContent
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');

  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link href="${styleUri}" rel="stylesheet">
  <title>JSON Log Viewer</title>
</head>
<body>
  <div class="toolbar">
    <div class="search-container">
      <input type="text" id="searchInput" placeholder="Search logs..." />
      <button class="search-help-btn" id="searchHelpBtn" title="Search syntax help">?</button>
    </div>
    <div class="filter-container">
      <label>Level:</label>
      <select id="levelFilter">
        <option value="ALL">ALL</option>
        <option value="DEBUG">DEBUG</option>
        <option value="INFO">INFO</option>
        <option value="WARN">WARN</option>
        <option value="ERROR">ERROR</option>
      </select>
    </div>
    <div class="stats" id="stats"></div>
  </div>
  <div class="log-container" id="logContainer"></div>
  
  <!-- Search Help Popup -->
  <div class="search-help-popup" id="searchHelpPopup">
    <div class="search-help-header">
      <h4>Search Syntax</h4>
      <button class="close-btn" id="closeSearchHelp">&times;</button>
    </div>
    <div class="search-help-content">
      <table>
        <tr><td><code>keyword</code></td><td>Simple text search</td></tr>
        <tr><td><code>field=value</code></td><td>Exact match</td></tr>
        <tr><td><code>field!=value</code></td><td>Not equal</td></tr>
        <tr><td><code>field=~value</code></td><td>Contains</td></tr>
        <tr><td><code>field!~value</code></td><td>Not contains</td></tr>
      </table>
      <h5>Logical Operators</h5>
      <table>
        <tr><td><code>expr1 and expr2</code></td><td>Both match</td></tr>
        <tr><td><code>expr1 or expr2</code></td><td>Either matches</td></tr>
      </table>
      <h5>Available Fields</h5>
      <p><code>time</code>, <code>level</code>, <code>name</code>, <code>message</code>, <code>caller</code>, or any field in <code>fields</code></p>
      <h5>Examples</h5>
      <ul>
        <li><code>name=~android</code></li>
        <li><code>level=ERROR</code></li>
        <li><code>name=~game and level!=DEBUG</code></li>
      </ul>
    </div>
  </div>

  <!-- Fields Modal -->
  <div class="modal-overlay" id="modalOverlay">
    <div class="modal">
      <div class="modal-header">
        <h3>Fields</h3>
        <div class="modal-tabs">
          <button class="tab-btn active" data-tab="viewer">VIEWER</button>
          <button class="tab-btn" data-tab="raw">RAW</button>
        </div>
        <button class="close-btn" id="closeModal">&times;</button>
      </div>
      <div class="modal-content">
        <div class="tab-content active" id="viewerTab"></div>
        <div class="tab-content" id="rawTab"></div>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const initialLogContent = \`${escapedContent}\`;
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

export function deactivate() {}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

