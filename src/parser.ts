/**
 * Parses code one line below the active cursor position
 */

'use strict';

import { Lexed, Lexer }              from './lexer';
import { Grammer, Options, Settings} from './settings';
import * as vscode                   from 'vscode';

import Window           = vscode.window;
import QuickPickItem    = vscode.QuickPickItem;
import QuickPickOptions = vscode.QuickPickOptions;
import Document         = vscode.TextDocument;
import Position         = vscode.Position;
import Range            = vscode.Range;
import Selection        = vscode.Selection;
import TextDocument     = vscode.TextDocument;
import TextEditor       = vscode.TextEditor;

/**
 * Describes a function parameter
 */
export interface Param {
  /**
   * Parameter's name. Should always be present
   */
  name: string,

  /**
   * Parameter's value. Usually empty string if no parameter value is provided
   */
  val: string,

  /**
   * Parameter's data type. This is usually language specific and is not 
   * required. Ex. string, integer, array, etc.
   */
  type?: string
}

/**
 * Tokenized code returned from lexer. This defines whether lexed code was a 
 * class, function of variable
 */
export interface Tokens {
  /**
   * Name of code binding/identifier
   */
  name: string,

  /**
   * What type of code it is. (class, function, variable)
   */
  type: string,

  /**
   * Describes if there is a return value, and what type it is
   */
  return?: {
    /**
     * Indicates if there is a return value for this function
     */
    present: boolean,

    /**
     * Describes what type of return value. (Optional)
     */
    type?: string    
  }

  /**
   * List of function parameters if token is describing a function
   */
  params?: Param[]
}

/**
 * Inital Class for parsing Doc Block comments
 */
export class Parser {
  /**
   * Extensions configuration settings
   * 
   * @var  {vscode.WorkspaceConfiguration}
   */
  public config: vscode.WorkspaceConfiguration;

  /**
   * Number of spaces between tag elements. Retrieved from editor configuration
   * 
   * @var  {string}
   */
  public columns: string;

  /**
   * Language specific parser settings
   * 
   * @var  {Settings}
   */
  public settings: Settings;

  constructor(options: Options) {
    // Get instance of language settings
    this.settings = new Settings(options);
    // Get extension configuration
    this.config = vscode.workspace.getConfiguration('docblockr');
    // Get column spacing from configuration object
    let column: number = this.config.get('columnSpacing');
    // Generate spaces based on column number
    this.columns = Array(column + 1).join(' ');
  }

  /**
   * Replaces any `$` character with `\\$`
   * 
   * Prevents issues with tabstop variables in Visual Studio Code
   * 
   * @param string 
   */
  protected escape(string: string): string {
    return string.replace('$', '\\$');
  }

  /**
   * Searches lexed objects by the type property
   * 
   * @param   {string}      type       Type value to search for
   * @param   {Lexed[]}     lexedObjs  List of lexed objects
   * 
   * @return  {Lexed|null}             Lexed object found, null if no result 
   *                                   was found
   */
  public findByType(type: string, lexedObjs: Lexed[]): Lexed | null {
    // Intialize result as null
    let result = null;
    // Iterate over lexed objects
    for (let i in lexedObjs) {
      // Check if type value matches
      if (lexedObjs[i].type === type) {
        // Determine lexed object position in array 
        lexedObjs[i].index = parseInt(i);
        // Return lexed object
        result = lexedObjs[i];
      }
    }
    return result;
  }

  /**
   * Parses code block and generates doc block for said code block
   * 
   * @param   {TextDocument}  editor  The content of the editor
   * 
   * @return  {string}                Doc block string 
   */
  public init(editor: TextEditor): string {
    // Get document from text editor
    let doc = editor.document;
    // Current position of cursor
    let current = Window.activeTextEditor.selections[0].active;
    // Get line below current position
    let nextLine = doc.lineAt(current.line + 1);
    // Prevent potiential issues by trimming trailing whitespace
    let nextLineTrimed = nextLine.text.trim();
    // Lex code below our cursor location
    let lexed = this.tokenize(nextLineTrimed);
    // Create doc block string from parsed code
    return this.renderBlock(lexed);
  }

  /**
   * Lex code string provided
   * 
   * @param   {string}   code  Code string to lex
   * 
   * @return  {Lexed[]}        List of lexed tokens 
   */
  public lex(code: string): Lexed[] {
    return new Lexer(code).getTokens();
  }

  /**
   * Checkes if token from lexed object matches any grammer settings
   * 
   * @param   {string}   token  Potiential token name
   * @param   {string}   type   Optionally grammer type to check against
   * 
   * @return  {boolean}         True if token name exists in grammer
   */
  public matchesGrammer(token: string, type: string = ''): boolean {
    // Shortcut for grammer object
    let grammers = this.settings.grammer;
    // Check if token matches grammer type provided
    if (this.settings.grammer.hasOwnProperty(type)) {
      // Add special case for the modifiers and variables properties since it 
      // is an array
      if (type === 'modifiers' || type === 'variables' || type === 'types') {
        // Iterate over modifiers
        for (let i = 0; i < this.settings.grammer[type].length; i++) {
          // Check if token provided matches modifier
          if (this.settings.grammer[type][i] === token)
            return true;
        }
      } else
        // Check if token provided matches grammer property provided
        return this.settings.grammer[type] === token;
    }
    // Loop over grammer properties
    for (let grammer in this.settings.grammer)
      // Check if the token being checked has a grammer setting
      if (this.settings.grammer[grammer] === token)
        // Indicate that this is a token name
        return true;
    // Return false by default
    return false;
  }

  /**
   * Renders docblock string based on tokenized object
   *
   * @param   {Tokens}  tokens  Tokenized docblock object
   *
   * @return  {string}          Generated docblock string
   */
  public renderBlock(tokens: Tokens): string {
    // Determine if token is a variable
    let isVariable = tokens.type === 'variable';
    // Incremented count value for incrementing tab selection number
    let count = 1;
    // Convert string to a snippet placeholder and auto-increment the counter 
    // each call
    let placeholder = (string: string) => `\$\{${count++}:${string}\}`;
    // Create new array for each doc block line
    let blockList: string[] = [];
    // Function description
    blockList.push(placeholder(`[${this.escape(tokens.name)} description]`));
    // Parameter tags
    blockList = this.renderParamTags(tokens, blockList, placeholder);
    // Return tag
    blockList = this.renderReturnTag(tokens, blockList, placeholder);
    // Var tag
    blockList = this.renderVarTag(tokens, blockList, placeholder);
    // Shortcut of end of string variable
    let eos = this.settings.eos;
    // Format and return docblock string
    return this.settings.commentOpen + eos + blockList.map(blockLine => {
      return this.settings.separator + blockLine;
    }).join(eos) + eos + this.settings.commentClose;
  }

  /**
   * Renders parameter tags for docblock
   * 
   * @param   {Tokens}    tokens       Tokenized code 
   * @param   {string[]}  blockList    List of docblock lines
   * @param   {Function}  placeholder  Function for snippet formatting
   * 
   * @return  {string[]}               Parameter blocks appeneded to block 
   *                                   list. Returns list pasted in if no 
   *                                   parameters
   */
  public renderParamTags(
    tokens: Tokens, 
    blockList: string[], 
    placeholder: Function
  ): string[] {
    // Get column spacing from configuration object
    let column: number = this.config.get('columnSpacing');
    // Check if there are any function parameters
    if (tokens.params.length && tokens.type !== 'variable') {
      // Empty line
      blockList.push('');
      // Get maximum number of characters from param names
      let max = prop => tokens.params.map(param => param[prop].length)
        .reduce((a, b) => Math.max(a, b));
      // Iterator over list of parameters
      for (let param of tokens.params) {
        // Calculate difference in string size
        let diff = max('name') - param.name.length;
        // Calculate total param name spaces
        let pSpace = Array((column + 1) + diff).join(' ');
        // Calculate parameter type column spacing. If no types were provided 
        // default to 1
        let typeDiff = param.hasOwnProperty('type') 
          ? max('type') - param.type.length : 1;
        // Calculate type spacing
        let tSpace = Array((column + 1) + typeDiff).join(' ');
        // Shortcut for column space
        let cSpace = this.columns;
        // Define parameter type
        let type = '';
        // Check if parameter has a type
        if (param.hasOwnProperty('type')) {
          // Get parameter type from token object
          type = placeholder(this.escape(param.type));
        } else {
          // Use param type placeholder
          type = placeholder('[type]');
        }
        // Prevent tabstop conflicts
        let name = this.escape(param.name);
        // Description shortcut
        let desc = placeholder(`[${name} description]`);
        // Append param to docblock
        blockList.push(`@param${cSpace} ${type}${tSpace}${name}${pSpace}${desc}`);
      }
    }
    return blockList;
  }

  /**
   * Render return tag for docblock
   * 
   * @param   {Tokens}    tokens       Tokenized code 
   * @param   {string[]}  blockList    List of docblock lines
   * @param   {Function}  placeholder  Function for snippet formatting
   * 
   * @return  {string[]}               Return block appeneded to block list. 
   *                                   Returns list provided if variable or no 
   *                                   return tag
   */
  public renderReturnTag(
    tokens: Tokens, 
    blockList: string[], 
    placeholder: Function
  ): string[] {
    // Detemine whether or not to display the return type by default
    let defaultReturnTag: boolean = this.config.get('defaultReturnTag');
    // Check if return section should be displayed
    if (tokens.return.present && defaultReturnTag && tokens.type !== 'variable') {
      let type = '[type]';
      // Check if a return type was provided
      if (tokens.return.type) {
        type = this.escape(tokens.return.type);
      }
      // Empty line
      blockList.push('');
      // Return type
      blockList.push(`@return${this.columns}${placeholder(type)}`);
    }
    return blockList;
  }

  /**
   * Render var tag for docblock
   * 
   * @param   {Tokens}    tokens       Tokenized code 
   * @param   {string[]}  blockList    List of docblock lines
   * @param   {Function}  placeholder  Function for snippet formatting
   * 
   * @return  {string[]}               Var block appeneded to block list. 
   *                                   Returns list provided if not a variable
   */
  public renderVarTag(
    tokens: Tokens, 
    blockList: string[], 
    placeholder: Function
  ): string[] {
    // Add special case of variable blocks
    if (tokens.type === 'variable') {
      // Empty line
      blockList.push('');
      // Var type
      blockList.push(`@var${this.columns}${placeholder(`[type]`)}`);
    }
    return blockList;
  }

 /**
   * Create tokenized object based off of the output from the Pug Lexer
   *
   * @param   {string}  code    Code to lex via the bug lexer
   * @param   {string}  next    Token name from previous function instance. Used 
   *                            for letting the `tokenize` method now it should 
   *                            be expecting a token name
   * @param   {Tokens}  tokens  Tokens created from the previous tokenize 
   *                            instance
   *
   * @return  {Tokens}          Tokens retrieved from Pug Lexer output
   */
  public tokenize(code: string, next: string = '', tokens: Tokens = null): Tokens {
    // Create empty token object if none is present
    if (tokens === null) {
      tokens = {name: '', type: '', params: [], return: { present: true }};
    }
    return tokens;
  }
}