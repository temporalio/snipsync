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

- The Github repositories where the tool will look for source code snippets.
- The local directory that contains the files to be spliced with the code snippets.

If the `ref` key is left blank or not specified, then the most recent commit from the master branch will be used.
If the `enable_source_link` key in `features` is not specified, then it will default to `true`.

Example of a complete snipsync.config.yaml:

```yaml
origins:
  - owner: temporalio
    repo: go-samples
    ref: 6880b0d09ddb6edf150e3095c90522602022578f
  - owner: temporalio
    repo: java-samples

target: docs

features:
  enable_source_link: false
```

Example of a bare minimum snipsync.config.yaml:

```yaml
origins:
  - owner: temporalio
    repo: go-samples
target: docs
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

In order to customize how a single snip is rendered, put a custom feature configuration as JSON in the snip start line.

```md
<!--SNIPSTART hellouniverse {"enable_source_link": false}-->
<!--SNIPEND-->
```

## Run

From the root directory of your project run the following command:

```bash
snipsync
```

### Remove snippets

In some cases, you may want to remove the snippets from your target files.
Use the `--clear` flag to do that:

```
snipsync --clear
```

## Development

The snipsync tool is set up to test its own functionality during development.
Git ignores the snipsync.config.yaml file and the 'docs' directory within the package itself.
Run `yarn dev` to run snipsync from within the package.
