import * as vscode from "vscode";
import * as path from "path";
import * as child_process from "child_process";
import * as fs from "fs";

export function activate(context: vscode.ExtensionContext) {
    const issueRegex = /\(#(\d+)\)/g;

    const provider: vscode.DocumentLinkProvider<vscode.DocumentLink> = {
        provideDocumentLinks(
            document: vscode.TextDocument,
            token: vscode.CancellationToken
        ): vscode.ProviderResult<vscode.DocumentLink[]> {
            const links: vscode.DocumentLink[] = [];
            const repoUrl = getRepoUrl(document.uri.fsPath);

            if (!repoUrl) {
                return links;
            }

            const tokens = tokenizeDocument(document);
            let match: RegExpExecArray | null;

            for (const token of tokens) {
                if (token.type === "comment") {
                    issueRegex.lastIndex = 0; // Reset regex index
                    while ((match = issueRegex.exec(token.text)) !== null) {
                        const issueNumber = match[1];
                        const startIndex =
                            token.range.start.character + match.index;
                        const endIndex = startIndex + match[0].length;

                        const range = new vscode.Range(
                            new vscode.Position(
                                token.range.start.line,
                                startIndex
                            ),
                            new vscode.Position(
                                token.range.start.line,
                                endIndex
                            )
                        );

                        const issueUrl = `${repoUrl}/issues/${issueNumber}`;
                        const link = new vscode.DocumentLink(
                            range,
                            vscode.Uri.parse(issueUrl)
                        );
                        link.tooltip = `Open GitHub Issue #${issueNumber}`;
                        links.push(link);
                    }
                }
            }

            return links;
        },
    };

    const selector: vscode.DocumentSelector = { scheme: "file", language: "*" };
    context.subscriptions.push(
        vscode.languages.registerDocumentLinkProvider(selector, provider)
    );
}

function getRepoUrl(filePath: string): string | null {
    let dir = path.dirname(filePath);

    while (true) {
        if (fs.existsSync(path.join(dir, ".git"))) {
            break;
        }
        const parentDir = path.dirname(dir);
        if (dir === parentDir) {
            return null;
        }
        dir = parentDir;
    }

    try {
        const originBuffer = child_process.execSync(
            "git config --get remote.origin.url",
            { cwd: dir }
        );
        const originUrl = originBuffer.toString().trim();

        if (originUrl.startsWith("git@")) {
            const sshMatch = originUrl.match(/git@([^:]+):(.+?)(\.git)?$/);
            if (sshMatch) {
                return `https://${sshMatch[1]}/${sshMatch[2]}`;
            }
        } else if (
            originUrl.startsWith("http://") ||
            originUrl.startsWith("https://")
        ) {
            return originUrl.replace(/\.git$/, "");
        }

        return null;
    } catch (error) {
        return null;
    }
}

function tokenizeDocument(
    document: vscode.TextDocument
): { text: string; range: vscode.Range; type: string }[] {
    const tokens: { text: string; range: vscode.Range; type: string }[] = [];
    const lineCount = document.lineCount;

    for (let lineNumber = 0; lineNumber < lineCount; lineNumber++) {
        const line = document.lineAt(lineNumber);
        const lineText = line.text;
        const tokenType = getTokenType(lineText, document.languageId);
        tokens.push({
            text: lineText,
            range: line.range,
            type: tokenType,
        });
    }

    return tokens;
}

function getTokenType(lineText: string, languageId: string): string {
    const trimmedLine = lineText.trim();

    const commentSymbols: { [key: string]: string[] } = {
        javascript: ["//", "/*", "*", "*/"],
        typescript: ["//", "/*", "*", "*/"],
        python: ["#"],
    };

    const symbols = commentSymbols[languageId] || [
        "//",
        "#",
        "/*",
        "*",
        "*/",
        "--",
        "%",
    ];

    for (const symbol of symbols) {
        if (trimmedLine.startsWith(symbol)) {
            return "comment";
        }
    }

    return "code";
}

export function deactivate() {}
