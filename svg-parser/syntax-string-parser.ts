export enum TokenProcessorOptionTypes {
  ZERO_OR_MORE = '*',
  ONE_OR_MORE = '+',
  ZERO_OR_ONE = '?',
}

export type TokenValidatorOptionsConfig<TokenTypes extends string> = {
  value: TokenValidator<TokenTypes>;
  option: TokenProcessorOptionTypes;
};

export type TokenValidator<TokenTypes extends string> = TokenTypes | RegExp | TokenValidatorOptionsConfig<TokenTypes> | TokenValidator<TokenTypes>[];

export type GrammarMapTokenTypeDescriptor<TokenTypes extends string> = {
  options: TokenValidator<TokenTypes>[];
};

export type BaseGrammarMapType<TokenTypes extends string> = {
  [type in TokenTypes]: GrammarMapTokenTypeDescriptor<TokenTypes>;
};

export type Grammar<TokenTypes extends string> = {
  entry: TokenTypes;
  map: BaseGrammarMapType<TokenTypes>;
};

export type AST<TokenTypes extends string> = {
  startIndex: number;
  endIndex: number;
  tokenType: TokenTypes;
  value: string | AST<TokenTypes> | AST<TokenTypes>[];
};

type TokenValidationProcessorReturnValue<TokenTypes extends string> = AST<TokenTypes> | false;
type TokenValidationProcessor = <TokenTypes extends string>(
  syntaxString: string,
  tokenType: TokenTypes,
  tokenValidator: TokenValidator<TokenTypes>,
  grammarMap: BaseGrammarMapType<TokenTypes>,
  currentIndex: number
) => TokenValidationProcessorReturnValue<TokenTypes>;
type TokenValidatorOptionProcessorMap = {
  [key in TokenProcessorOptionTypes]: TokenValidationProcessor;
};

const PROCESS_REGEX: TokenValidationProcessor = <TokenTypes extends string>(
  syntaxString: string,
  tokenType: TokenTypes,
  tokenValidator: TokenValidator<TokenTypes>,
  _grammarMap: BaseGrammarMapType<TokenTypes>,
  currentIndex: number
): TokenValidationProcessorReturnValue<TokenTypes> => {
  if (tokenValidator instanceof RegExp) {
    const stringFromIndex = syntaxString.slice(currentIndex);
    const match = stringFromIndex.match(tokenValidator);

    if (match) {
      const consumedString = match[0] || '';

      return {
        startIndex: currentIndex,
        endIndex: currentIndex + (consumedString.length - 1),
        value: consumedString,
        tokenType,
      };
    }
  }

  return false;
};
const TOKEN_VALIDATOR_OPTION_PROCESSORS: TokenValidatorOptionProcessorMap = {
  [TokenProcessorOptionTypes.ZERO_OR_MORE]: <TokenTypes extends string>(
    syntaxString: string,
    tokenType: TokenTypes,
    tokenValidator: TokenValidator<TokenTypes>,
    grammarMap: BaseGrammarMapType<TokenTypes>,
    currentIndex: number
  ): TokenValidationProcessorReturnValue<TokenTypes> => {
    const results: AST<TokenTypes>[] = [];

    let latestCurrentIndex = currentIndex;

    while (true) {
      const resultAst = processTokenValidator(syntaxString, tokenType, tokenValidator, grammarMap, latestCurrentIndex);

      if (resultAst) {
        const { endIndex } = resultAst;

        latestCurrentIndex = endIndex + 1;

        results.push(resultAst);
      } else {
        break;
      }
    }

    return results.length > 0
      ? {
          startIndex: currentIndex,
          endIndex: latestCurrentIndex - 1,
          value: results,
          tokenType: tokenType,
        }
      : // IMPORTANT: This processor is ALWAYS VALID, but it can return an "empty" result.
        {
          startIndex: currentIndex,
          endIndex: currentIndex,
          value: '',
          tokenType,
        };
  },
  [TokenProcessorOptionTypes.ONE_OR_MORE]: <TokenTypes extends string>(
    syntaxString: string,
    tokenType: TokenTypes,
    tokenValidator: TokenValidator<TokenTypes>,
    grammarMap: BaseGrammarMapType<TokenTypes>,
    currentIndex: number
  ): TokenValidationProcessorReturnValue<TokenTypes> => {
    const results: AST<TokenTypes>[] = [];

    let latestCurrentIndex = currentIndex;

    while (true) {
      const resultAst = processTokenValidator(syntaxString, tokenType, tokenValidator, grammarMap, latestCurrentIndex);

      if (resultAst) {
        const { endIndex } = resultAst;

        latestCurrentIndex = endIndex + 1;

        results.push(resultAst);
      } else {
        break;
      }
    }

    return results.length > 0
      ? {
          startIndex: currentIndex,
          endIndex: latestCurrentIndex - 1,
          value: results,
          tokenType: tokenType,
        }
      : // IMPORTANT: This processor is ONLY VALID if there is AT LEAST ONE result.
        false;
  },
  [TokenProcessorOptionTypes.ZERO_OR_ONE]: <TokenTypes extends string>(
    syntaxString: string,
    tokenType: TokenTypes,
    tokenValidator: TokenValidator<TokenTypes>,
    grammarMap: BaseGrammarMapType<TokenTypes>,
    currentIndex: number
  ): TokenValidationProcessorReturnValue<TokenTypes> => {
    let singleResult: AST<TokenTypes> | undefined,
      latestCurrentIndex: number = currentIndex,
      tooManyResults: boolean = false;

    for (let i = 0; i < 2; i++) {
      const resultAst = processTokenValidator(syntaxString, tokenType, tokenValidator, grammarMap, latestCurrentIndex);

      if (resultAst) {
        // IMPORTANT: Check for a second result, if it is found, then this processor is invalid.
        if (i === 1) {
          tooManyResults = true;

          break;
        } else {
          const { endIndex } = resultAst;

          latestCurrentIndex = endIndex + 1;

          singleResult = resultAst;
        }
      } else {
        break;
      }
    }

    return !tooManyResults
      ? !singleResult
        ? // ZERO RESULTS
          {
            startIndex: currentIndex,
            endIndex: currentIndex,
            value: '',
            tokenType,
          }
        : // ONE RESULT
          singleResult
      : // IMPORTANT: This processor is ONLY VALID if there is ONLY ZERO results OR ONLY ONE result.
        false;
  },
};

const processTokenValidator: TokenValidationProcessor = <TokenTypes extends string>(
  syntaxString: string,
  tokenType: TokenTypes,
  tokenValidator: TokenValidator<TokenTypes>,
  grammarMap: BaseGrammarMapType<TokenTypes>,
  currentIndex: number
): AST<TokenTypes> | false => {
  if (tokenValidator instanceof Array) {
    // A combination of types.
    const resultList = [];

    for (const t of tokenValidator) {
      // TODO: Increment the `currentIndex`.
      const result = processTokenValidator<TokenTypes>(syntaxString, tokenType, t, grammarMap, currentIndex);

      if (!result) {
        return false;
      }

      resultList.push(result);
    }

    return resultList;
  } else if (tokenValidator instanceof RegExp) {
    // RegExp: Direct compare.
    const result = PROCESS_REGEX(syntaxString, tokenType, currentIndex, tokenValidator);

    if (result) {
      const { consumedString, newCurrentIndex } = result;

      return {
        startIndex: currentIndex,
        endIndex: newCurrentIndex - 1,
        tokenType: tokenType,
        value: consumedString,
      };
    }
  } else if (tokenValidator instanceof Object) {
    // Use a TokenValidatorOptionProcessor
    const { value: t, option } = tokenValidator;
    const optionProcessor = TOKEN_VALIDATOR_OPTION_PROCESSORS[option];
    const result = optionProcessor<TokenTypes>(syntaxString, currentIndex, t);

    if (result) {
      const { consumedString, newCurrentIndex } = result;

      return {
        startIndex: currentIndex,
        endIndex: newCurrentIndex - 1,
        value: consumedString,
        tokenType,
      };
    }
  } else {
    // string: Get from map
    const { options = [] } = grammarMap[tokenValidator];

    for (const t of options) {
      // TRICKY: Here, the new `tokenType` in the `tokenValidator` which is a string.
      const result = processTokenValidator(syntaxString, tokenValidator, t, grammarMap, currentIndex);

      if (result) {
        return result;
      }
    }
  }

  return false;
};

export const parseSyntaxString = <TokenTypes extends string>(syntaxString: string = '', grammar: Grammar<TokenTypes>): AST<TokenTypes> | false => {
  const { entry, map } = grammar;

  return processTokenValidator(syntaxString, entry, entry, map, 0);
};
