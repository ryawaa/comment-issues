import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
    const issueRegex = /\(\s*#(\d+)\s*\)/g;

    const provider = createDocumentLinkProvider(issueRegex, getRepoInfo);

    const selector: vscode.DocumentSelector = { scheme: 'file', language: '*' };
    context.subscriptions.push(
        vscode.languages.registerDocumentLinkProvider(selector, provider)
    );
}

export function createDocumentLinkProvider(
    issueRegex: RegExp,
    getRepoInfoFn: (filePath: string) => RepoInfo | null
): vscode.DocumentLinkProvider<vscode.DocumentLink> {
    return {
        provideDocumentLinks(
            document: vscode.TextDocument,
            token: vscode.CancellationToken
        ): vscode.ProviderResult<vscode.DocumentLink[]> {
            const links: vscode.DocumentLink[] = [];
            const repoInfo = getRepoInfoFn(document.uri.fsPath);

            if (!repoInfo) {
                return links;
            }

            const { repoUrl, providerName, repoName } = repoInfo;
            const displayName = repoName || providerName;

            const tokens = tokenizeDocument(document);
            let match: RegExpExecArray | null;

            for (const token of tokens) {
                if (token.type === 'comment') {
                    issueRegex.lastIndex = 0;
                    while ((match = issueRegex.exec(token.text)) !== null) {
                        const issueNumber = match[1];
                        const matchStart = match.index;
                        const matchEnd = match.index + match[0].length;

                        const tokenStartOffset = document.offsetAt(token.range.start);
                        const absoluteStartOffset = tokenStartOffset + matchStart;
                        const absoluteEndOffset = tokenStartOffset + matchEnd;

                        const range = new vscode.Range(
                            document.positionAt(absoluteStartOffset),
                            document.positionAt(absoluteEndOffset)
                        );

                        const issueUrl = getIssueUrl(
                            repoUrl,
                            issueNumber,
                            providerName
                        );
                        const link = new vscode.DocumentLink(
                            range,
                            vscode.Uri.parse(issueUrl)
                        );
                        link.tooltip = `Open ${displayName} Issue #${issueNumber}`;
                        links.push(link);
                    }
                }
            }

            return links;
        },
    };
}

export function getRepoInfo(
    filePath: string,
    execSyncFn: (
        command: string,
        options?: child_process.ExecSyncOptions
    ) => Buffer = child_process.execSync
): RepoInfo | null {
    let dir = path.dirname(filePath);

    while (true) {
        if (fs.existsSync(path.join(dir, '.git'))) {
            break;
        }
        const parentDir = path.dirname(dir);
        if (dir === parentDir) {
            return null;
        }
        dir = parentDir;
    }

    try {
        const originBuffer = execSyncFn('git config --get remote.origin.url', {
            cwd: dir,
        });
        const originUrl = originBuffer.toString().trim();

        let repoUrl = '';
        let providerName = '';
        let repoName: string | null = null;

        if (originUrl.startsWith('git@')) {
            const sshMatch = originUrl.match(/git@([^:]+):(.+?)(\.git)?$/);
            if (sshMatch) {
                const host = sshMatch[1];
                const repoPath = sshMatch[2];
                repoUrl = `https://${host}/${repoPath}`;
                providerName = getProviderName(host);
                repoName = repoPath;
            }
        } else if (
            originUrl.startsWith('http://') ||
            originUrl.startsWith('https://')
        ) {
            const urlWithoutGit = originUrl.replace(/\.git$/, '');
            const urlMatch = urlWithoutGit.match(/https?:\/\/([^\/]+)\/(.+)/);
            if (urlMatch) {
                const host = urlMatch[1];
                const repoPath = urlMatch[2];
                repoUrl = `https://${host}/${repoPath}`;
                providerName = getProviderName(host);
                repoName = repoPath;
            }
        }

        if (repoUrl && providerName) {
            return { repoUrl, providerName, repoName };
        }

        return null;
    } catch (error) {
        return null;
    }
}

function getProviderName(host: string): string {
    if (host.includes('github.com')) {
        return 'GitHub';
    } else if (host.includes('gitlab.com')) {
        return 'GitLab';
    } else if (host.includes('bitbucket.org')) {
        return 'Bitbucket';
    } else {
        return 'Git';
    }
}

export function getIssueUrl(
    repoUrl: string,
    issueNumber: string,
    providerName: string
): string {
    switch (providerName) {
        case 'GitHub':
            return `${repoUrl}/issues/${issueNumber}`;
        case 'GitLab':
            return `${repoUrl}/-/issues/${issueNumber}`;
        case 'Bitbucket':
            return `${repoUrl}/issues/${issueNumber}`;
        default:
            return `${repoUrl}/issues/${issueNumber}`;
    }
}

export function tokenizeDocument(
    document: vscode.TextDocument
): { text: string; range: vscode.Range; type: string }[] {
    const tokens: { text: string; range: vscode.Range; type: string }[] = [];
    const text = document.getText();

    const commentRegexes: { [key: string]: RegExp } = {
        javascript: /\/\/.*|\/\*[\s\S]*?\*\//g,
        typescript: /\/\/.*|\/\*[\s\S]*?\*\//g,
        python: /#.*|'''[\s\S]*?'''|"""[\s\S]*?"""/g,
        rust: /\/\/.*|\/\*[\s\S]*?\*\//g, // broken on rust (#2)
        java: /\/\/.*|\/\*[\s\S]*?\*\//g,
        c: /\/\/.*|\/\*[\s\S]*?\*\//g,
        cpp: /\/\/.*|\/\*[\s\S]*?\*\//g,
        go: /\/\/.*|\/\*[\s\S]*?\*\//g,
        swift: /\/\/.*|\/\*[\s\S]*?\*\//g,
    };

    const commentRegex =
        commentRegexes[document.languageId] ||
        /\/\/.*|\/\*[\s\S]*?\*\//g;

    let match: RegExpExecArray | null;
    while ((match = commentRegex.exec(text)) !== null) {
        const matchStart = match.index;
        const matchEnd = match.index + match[0].length;

        const range = new vscode.Range(
            document.positionAt(matchStart),
            document.positionAt(matchEnd)
        );

        tokens.push({
            text: match[0],
            range: range,
            type: 'comment',
        });
    }

    return tokens;
}

export function getTokenType(lineText: string, languageId: string): string {
    const trimmedLine = lineText.trim();

    const commentSymbols: { [key: string]: string[] } = {
        javascript: ['//', '/*', '*', '*/'],
        typescript: ['//', '/*', '*', '*/'],
        python: ['#'],
        rust: ['//', '/*', '*', '*/'],
        java: ['//', '/*', '*', '*/'],
        c: ['//', '/*', '*', '*/'],
        cpp: ['//', '/*', '*', '*/'],
        go: ['//', '/*', '*', '*/'],
        swift: ['//', '/*', '*', '*/'],
    };

    const symbols = commentSymbols[languageId] || [
        '//',
        '#',
        '/*',
        '*',
        '*/',
        '--',
        '%',
    ];

    for (const symbol of symbols) {
        if (trimmedLine.startsWith(symbol)) {
            return 'comment';
        }
    }

    return 'code';
}

export function deactivate() {}

export type RepoInfo = {
    repoUrl: string;
    providerName: string;
    repoName: string | null;
};
