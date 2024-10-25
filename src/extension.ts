import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
    const provider: vscode.DocumentLinkProvider = {
        provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken) {
            const links: vscode.DocumentLink[] = [];
            const repoUrl = getRepoUrl(document.uri.fsPath);

            if (!repoUrl) {
                return links;
            }

            const issueRegex = /\(#(\d+)\)/g;
            const lineCount = document.lineCount;

            for (let lineNumber = 0; lineNumber < lineCount; lineNumber++) {
                const line = document.lineAt(lineNumber);
                const lineText = line.text;

                // Check if the line is a comment
                if (isCommentLine(lineText, document.languageId)) {
                    let match: RegExpExecArray | null;
                    while ((match = issueRegex.exec(lineText)) !== null) {
                        const issueNumber = match[1];
                        const startIndex = match.index;
                        const endIndex = startIndex + match[0].length;

                        const range = new vscode.Range(
                            line.range.start.translate(0, startIndex),
                            line.range.start.translate(0, endIndex)
                        );

                        const issueUrl = `${repoUrl}/issues/${issueNumber}`;
                        const link = new vscode.DocumentLink(range, vscode.Uri.parse(issueUrl));
                        link.tooltip = `Open GitHub Issue #${issueNumber}`;
                        links.push(link);
                    }
                }
            }

            return links;
        }
    };

    const selector = { scheme: 'file', language: '*' };
    context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(selector, provider));
}

function getRepoUrl(filePath: string): string | null {
    let dir = path.dirname(filePath);

    while (!fs.existsSync(path.join(dir, '.git'))) {
        const parentDir = path.dirname(dir);
        if (dir === parentDir) {
            return null;
        }
        dir = parentDir;
    }

    try {
        const originBuffer = child_process.execSync('git config --get remote.origin.url', { cwd: dir });
        const originUrl = originBuffer.toString().trim();
        let repoUrl = null;

        if (originUrl.startsWith('git@')) {
            const sshRegex = /git@([^:]+):(.+)\.git/;
            const match = sshRegex.exec(originUrl);
            if (match) {
                repoUrl = `https://${match[1]}/${match[2]}`;
            }
        } else if (originUrl.startsWith('https://') || originUrl.startsWith('http://')) {
            repoUrl = originUrl.replace(/\.git$/, '');
        }

        return repoUrl;
    } catch (error) {
        return null;
    }
}

function isCommentLine(lineText: string, languageId: string): boolean {
    const trimmedLine = lineText.trim();
    const commentPatterns: { [key: string]: string[] } = {
        'javascript': ['//'],
        'typescript': ['//'],
        'java': ['//'],
        'c': ['//'],
        'cpp': ['//'],
        'csharp': ['//'],
        'python': ['#'],
        'shellscript': ['#'],
        'ruby': ['#'],
        'perl': ['#'],
        'lua': ['--'],
        'haskell': ['--'],
        'coffeescript': ['#'],
        'elixir': ['#'],
        'erlang': ['%'],
        'sql': ['--'],
        // Add more languages as needed
    };

    const commentSymbols = commentPatterns[languageId];

    if (commentSymbols) {
        return commentSymbols.some(symbol => trimmedLine.startsWith(symbol));
    } else {
        const commonCommentSymbols = ['//', '#', '--', ';', '%'];
        return commonCommentSymbols.some(symbol => trimmedLine.startsWith(symbol));
    }
}

export function deactivate() {}
