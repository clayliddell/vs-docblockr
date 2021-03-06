/**
 * Tests code in `src` against specified tslint rules
 */

import * as assert from 'assert';
import { readdirSync, readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import { Configuration, Linter } from 'tslint';
import { commands, Selection, SnippetString, TextDocument, TextEditor } from 'vscode';

import TestEditor from './TestEditor';

interface IFile {
  /**
   * Name of the file
   */
  name: string;

  /**
   * Path to the file
   */
  path?: string;
}

/**
 * Recursively get source code files and their absolute path on the file system
 *
 * @param   {string}   dir    Absolute path to source code
 * @param   {IFile[]}  files  List of file names, and paths
 *
 * @return  {IFile[]}         List of files and paths
 */
const getFiles = (dir: string, items: IFile[]): IFile[] => {
  // Get names of each file in specified folder
  readdirSync(dir).forEach((file) => {
    // Get absolute path to file
    const path = dir + '/' + file;
    // Determine whether to proceed into sub-folders
    if (statSync(path).isDirectory()) {
      // Get files in sub-folders
      items = getFiles(path, items);
    } else {
      // Push file and path to return list
      items.push({
        name: file,
        path,
      });
    }
  });
  return items;
};

const extensionPath = resolve(__dirname, '../../');

// Absolute path to src code
const src = resolve(extensionPath, 'src');
// Get list of source files and their absolute paths on the file system
const files = getFiles(src, []);
// Resolve to linter configuration
const config = resolve(extensionPath, 'tslint.json');

suite('Code style validation', () => {
  // Test each file resolved in files list. This should only be the source files
  files.forEach((file) => {
    test(`validates ${file.name}`, () => {
      // Get new linter instance that does not attempt to fix error-ed code
      const linter = new Linter({ fix: false });
      // Pull file's contents
      const contents = readFileSync(file.path, 'utf8');
      // Get configuration based on current file context
      const configuration = Configuration.findConfiguration(config, file.path).results;
      // Test file against linter
      linter.lint(file.path, contents, configuration);
      const result = linter.getResult();

      assert.strictEqual(result.errorCount, 0, result.output);
    });
  });
});

suite('Keybinding: /** + Enter', () => {
  let editor: TextEditor;
  let document: TextDocument;

  suiteSetup((done) => {
    TestEditor.loadEditor('typescript', (textEditor, textDocument) => {
      editor = textEditor;
      document = textDocument;

      done();
    });
  });

  test('should parse from keybinding', async () => {
    await editor.insertSnippet(new SnippetString('\nfunction foo(bar) {}'));

    const selection = new Selection(0, 0, 0, 0);

    editor.selection = selection;

    assert.ok(document.validateRange(selection));

    editor.insertSnippet(new SnippetString('/**\n')).then(() => {
      const actual = document.getText();

      const expected = [
        '/**',
        ' * [foo description]',
        ' *',
        ' * @param   {[type]}  bar  [bar description]',
        ' *',
        ' * @return  {[type]}       [return description]',
        ' */',
        'function foo(bar) {}',
      ].join('\n');

      assert.strictEqual(actual, expected);
    });
  });
});

suite('Commands', () => {
  let editor: TextEditor;
  let document: TextDocument;

  suiteSetup((done) => {
    TestEditor.loadEditor('typescript', (textEditor, textDocument) => {
      editor = textEditor;
      document = textDocument;

      done();
    });
  });

  suite('renderFromSelection', () => {
    test('should parse selected snippet', async () => {
      await editor.insertSnippet(new SnippetString('function foo(bar) {}'));

      const selection = new Selection(0, 0, 0, 18);

      editor.selection = selection;

      assert.ok(document.validateRange(selection));

      commands.executeCommand('vs-docblockr.renderFromSelection').then(() => {
        const actual = document.getText();

        const expected = [
          '/**',
          ' * [foo description]',
          ' *',
          ' * @param   {[type]}  bar  [bar description]',
          ' *',
          ' * @return  {[type]}       [return description]',
          ' */',
          'function foo(bar) {}',
        ].join('\n');

        assert.strictEqual(actual, expected);
      });
    });
  });
});
