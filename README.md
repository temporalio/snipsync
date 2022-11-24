# Snipsync

Snipsync makes sure your documented code snippets are always in sync with your Github repo source files.

## Prerequisites

This tool requires [Node](https://nodejs.org/) v15.0.0 or above (recommended 15.2.1) and [Yarn](https://yarnpkg.com/).

## Install

**Yarn**:

```bash
yarn add snipsync
```

## Configure

Create a file called "snipsync.config.yaml" in the project root.
This file specifies the following:

- `origins`: The Github repositories or local files where the tool will look for source code snippets.
- `targets`: The local directories that contain the files to be spliced with the code snippets.

The `origins` property is a list of objects that have one of the following 2 formats:

1. `owner`, `repo`, and optionally `ref`: pull snippets from a GitHub repo
2. `files`: array of strings containing relative paths to load snippets from. Supports [glob](https://www.npmjs.com/package/glob) syntax.

If the `ref` key is left blank or not specified, then the most recent commit from the master branch will be used.
If the `enable_source_link` key in `features` is not specified, then it will default to `true`.
If the `enable_code_block` key in `features` is not specified, then it will default to `true`.

The `allowed_target_extensions` key in `features` lets you set a list of extensions to scan. Specify extensions like `[.md,.txt]`.
If the `allowed_target_extensions` key in `features` is not specified, then it defaults to an empty array (`[]`) and all files are scanned. 

The `enable_code_dedenting` key in `features` lets you remove leading spaces from indented code snippets. This is handy when you're including a snippet of code within a class or function and don't want to include the leading indentation. This is `false` by default. 

Example of a complete `snipsync.config.yaml`:

```yaml
origins:
  - owner: temporalio
    repo: go-samples
    ref: 6880b0d09ddb6edf150e3095c90522602022578f
  - owner: temporalio
    repo: java-samples
  - files:
    - ./src/**/*.ts

targets:
  - docs
  - blog

features:
  enable_source_link: false
  enable_code_block: false
  allowed_target_extensions: [.md]
  enable_code_dedenting: false
```

Example of a bare minimum snipsync.config.yaml:

```yaml
origins:
  - owner: temporalio
    repo: go-samples
targets:
  - docs
```

## Comment wrappers

Use comments to identify code snippets and the locations where they should be merged.

### Source code

In the source repo, wrap the code snippets in comments with a unique snippet identifier like this:

```go
// @@@SNIPSTART hellouniverse
func HelloUniverse() {
	fmt.Println("Hello Universe!")
}
// @@@SNIPEND
```

In the example above, "hellouniverse" is the unique identifier for the code snippet.

Unique identifiers can contain letters, numbers, hyphens, and underscores.

### Target files

In the target files wrap the location with comments that reference the identifier of the code snippet that will be placed there:

```md
<!--SNIPSTART hellouniverse-->
<!--SNIPEND-->
```

In the example above, the "hellouniverse" code snippet will be spliced between the comments.
Any text inside of the placeholders will be replaced by the code snippet when the tool runs.
The tool will automatically specify the code type for markdown rendering.
For example, if the source file ends in ".go" then the code section will be written like this: ` ```go `

#### Per-snip features

To customize how a single snip is rendered, add a JSON feature configuration in the snip start line.

```md
<!--SNIPSTART hellouniverse {"enable_source_link": false, "enable_code_block": false}-->
<!--SNIPEND-->
```

**Selected lines**

A single source code snippet may be used in multiple places.
If so, you may wish to customize which lines are rendered.
Add a "selected" configuration to the snip start line.

```
<!--SNIPSTART hellouniverse {"select": ["1", "3-5"]}-->
```

The feature supports multiple selections as either a single line or a range.

**Highlighed lines**

Some frameworks support highlighting code lines in code blocks.
If so, you can add a "highlights" configuration to the snip start line.

```
<!--SNIPSTART hellouniverse {"highlights": "{1, 3-4}"}-->
```

## Run

From the root directory of your project run the following command:

```bash
yarn snipsync
```

### Remove snippets

In some cases, you may want to remove the snippets from your target files.
Use the `--clear` flag to do that:

```
yarn snipsync --clear
```

## Development

The snipsync tool is set up to test its own functionality during development.
Git ignores the snipsync.config.yaml file and the 'docs' directory within the package itself.
Run `yarn dev` to run snipsync from within the package.
