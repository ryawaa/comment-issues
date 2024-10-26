import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as child_process from "child_process";
import {
    getRepoInfo,
    getIssueUrl,
    tokenizeDocument,
    getTokenType,
    createDocumentLinkProvider,
    RepoInfo,
} from "../../extension";
import * as sinon from "sinon";

describe("Extension Tests", () => {
    afterEach(() => {
        // Restore any stubs if necessary
        sinon.restore();
    });

    it("getRepoInfo with GitHub SSH URL", () => {
        const mockFilePath = path.join(__dirname, "testfile.js");
        const mockOriginUrl = "git@github.com:owner/repo.git";

        // Corrected mockExecSync function (testing with this is still broken)
        const mockExecSync = (
            command: string,
            options?: child_process.ExecSyncOptions
        ): Buffer => {
            if (command === "git config --get remote.origin.url") {
                return Buffer.from(mockOriginUrl);
            }
            throw new Error("Command not stubbed");
        };

        const repoInfo = getRepoInfo(mockFilePath, mockExecSync);
        assert.strictEqual(repoInfo?.providerName, "GitHub");
        assert.strictEqual(repoInfo?.repoName, "owner/repo");
        assert.strictEqual(repoInfo?.repoUrl, "https://github.com/owner/repo");
    });

    it("getIssueUrl for GitHub", () => {
        const issueUrl = getIssueUrl(
            "https://github.com/owner/repo",
            "123",
            "GitHub"
        );
        assert.strictEqual(
            issueUrl,
            "https://github.com/owner/repo/issues/123"
        );
    });

    it("getIssueUrl for GitLab", () => {
        const issueUrl = getIssueUrl(
            "https://gitlab.com/owner/repo",
            "456",
            "GitLab"
        );
        assert.strictEqual(
            issueUrl,
            "https://gitlab.com/owner/repo/-/issues/456"
        );
    });

    it("getTokenType identifies comments correctly", () => {
        const commentLine = "// This is a comment";
        const codeLine = "const x = 42;";
        const languageId = "javascript";

        const commentType = getTokenType(commentLine, languageId);
        const codeType = getTokenType(codeLine, languageId);

        assert.strictEqual(commentType, "comment");
        assert.strictEqual(codeType, "code");
    });

    it("Tokenize document and detect issue links in comments", async () => {
        // Mock getRepoInfo to return a fixed repoInfo
        const mockRepoInfo: RepoInfo = {
            repoUrl: "https://github.com/owner/repo",
            providerName: "GitHub",
            repoName: "owner/repo",
        };

        const mockGetRepoInfo = sinon.stub().returns(mockRepoInfo);

        // Create an instance of the provider using the mocked getRepoInfo
        const issueRegex = /\(#(\d+)\)/g;

        const provider = createDocumentLinkProvider(
            issueRegex,
            mockGetRepoInfo
        );

        // Create a mock document
        const document = await vscode.workspace.openTextDocument({
            language: "javascript",
            content: `
                // This is a comment with an issue number (#789)
                const x = 42; // Another comment (#101112)
                /* Multi-line comment
                   with issue (#131415) */
            `,
        });

        const links = await provider.provideDocumentLinks(
            document,
            {} as vscode.CancellationToken
        );

        assert.strictEqual(links?.length, 3);

        const issueNumbers = ["789", "101112", "131415"];
        links?.forEach((link, index) => {
            const expectedUrl = `https://github.com/owner/repo/issues/${issueNumbers[index]}`;
            assert.strictEqual(link.target?.toString(), expectedUrl);
        });
    });
});
