import { Token } from 'acorn';
import { SymbolKind } from 'vscode';

import { Parser } from '../parser';
import { Symbols } from '../symbols';

/**
 * Parses tokens for the PHP language
 */
export class PHP extends Parser {
  /**
   * Constructs settings specific to PHP
   */
  constructor() {
    super({
      grammar: {
        class: [
          'class',
          'trait',
        ],
        function: [
          'function',
        ],
        identifier: '([a-zA-Z0-9_$\x7f-\xff]+)',
        modifiers: [
          'public',
          'static',
          'protected',
          'private',
          'abstract',
          'final',
        ],
        types: [
          'self',
          'array',
          'callable',
          'bool',
          'boolean',
          'float',
          'int',
          'integer',
          'string',
          'iterable',
          'stdClass',
        ],
        variables: [
          'const',
        ],
      },
    });
  }

  /**
   * Converts nullable type to union type (e.g. `type|null`). If type is not
   * nullable, return given type
   *
   * @param   {string}  type  Type to convert
   *
   * @return  {string}        Union docblock type, or original type if not
   *                          nullable
   */
  protected formatNullable(type: string): string {
    let result = type;

    // Expression to check if the given type is nullable by checking for the
    // occurrence of a leading '?' character
    const nullable = /^\?/;
    if (nullable.test(type)) {
      // Determine whether to return union type or simply "mixed"
      if (this.config.get('phpMixedUnionTypes')) {
         result = 'mixed';
      } else {
        // Indicate nullable by converting type to union type with null
        result = `${type.replace(nullable, '')}|null`;
      }
    }
    return result;
  }

  /**
   * Checks if the given string is a PHP type hint property
   *
   * @param   {string}   type  The string to check
   *
   * @return  {boolean}        Whether or not the string is a valid type
   */
  protected isType(type: string): boolean {
    const grammar = [
      'function',
      'class',
      'modifiers',
      'variables',
    ];

    const notReserved = grammar.every((item) => {
      return !this.grammar.is(type, item);
    });

    const isType = this.grammar.is(type, 'types');

    const classExpression = /^[a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*$/;

    return notReserved && (isType || classExpression.test(type));
  }

  /**
   * Checks if the given string is a variable PHP variable name
   *
   * @param   {string}  name  The string being checked
   *
   * @return  {boolean}       Whether or not the string is a variable name
   */
  protected isVariableName(name: string): boolean {
    const isVariable = /^\$/;

    return isVariable.test(name);
  }

  /**
   * @inheritdoc
   */
  protected parseClass(token: Token, symbols: Symbols) {
    if (this.grammar.is(token.value, 'class')) {
      symbols.type = SymbolKind.Class;

      this.expectName = true;

      return;
    }

    if (this.expectName && symbols.type === SymbolKind.Class && this.isName(token.value)) {
      symbols.name = token.value;

      this.expectName = false;
      this.done = true;
    }
  }

  /**
   * @inheritdoc
   */
  protected parseFunction(token: Token, symbols: Symbols) {
    if (this.grammar.is(token.value, 'function')) {
      symbols.type = SymbolKind.Function;

      this.expectName = true;

      return;
    }

    if (symbols.type === SymbolKind.Function) {
      if (token.type.label === '[') {
        symbols.return.type += '[]';

        return;
      }

      if (this.expectName && this.isName(token.value)) {
        symbols.name = token.value;

        this.expectName = false;

        return;
      }

      if (token.type.label === ':' && !this.expectParameter) {
        this.expectReturnType = true;

        return;
      }

      if (this.expectReturnType && this.matchesIdentifier(token.value)) {
        this.expectReturnType = false;

        symbols.return.type = token.value;

        return;
      }
    }
  }

  /**
   * Parses parameter name tokens
   *
   * @param  {Token}    token    The token retrieved from acorn
   * @param  {Symbols}  symbols  The symbols parsed from the tokens
   */
  protected parseParameterName(token: Token, symbols: Symbols) {
    const notType = !this.expectParameterType;

    if (this.expectParameter && this.isVariableName(token.value) && notType) {
      symbols.addParameter({
        name: token.value,
      });

      return;
    }
  }

  /**
   * @inheritdoc
   */
  protected parseParameters(token: Token, symbols: Symbols) {
    if (symbols.type === SymbolKind.Function) {
      if (token.type.label === '(') {
        this.expectParameter = true;
      }

      this.parseParameterName(token, symbols);
      this.parseParameterType(token, symbols);

      if (token.type.label === ')') {
        this.expectParameter = false;

        return;
      }
    }
  }

  /**
   * Parses parameter type tokens
   *
   * @param  {Token}    token    The token retrieved from acorn
   * @param  {Symbols}  symbols  The symbols parsed from the tokens
   */
  protected parseParameterType(token: Token, symbols: Symbols) {
    if (token.value && this.isType(token.value) && this.expectParameter) {
      this.expectParameterType = true;

      symbols.addParameter({
        name: '',
        type: token.value,
      });
    }

    if (this.expectParameterType && this.isVariableName(token.value)) {
      const lastParam = symbols.getParameter(symbols.getLastParameterIndex());

      if (lastParam) {
        lastParam.name = token.value;
      }
    }
  }

  /**
   * @inheritdoc
   */
  protected parseVariable(token: Token, symbols: Symbols) {
    if (!symbols.type && this.isVariableName(token.value)) {
      symbols.name = token.value;
      symbols.type = SymbolKind.Variable;
    }

    if (!symbols.type && this.grammar.is(token.value, 'variables')) {
      symbols.type = SymbolKind.Variable;

      this.expectName = true;

      return;
    }

    if (symbols.type === SymbolKind.Variable && this.expectName && token.value) {
      symbols.name = token.value;

      this.expectName = false;

      return;
    }
  }
}
