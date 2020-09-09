# Snipsync

Snipsync makes sure your documented code snippets are always in sync with your Github repo source files.

## Prerequisites

This tool requires [Node](https://nodejs.org/) and [Yarn](https://yarnpkg.com/).

## Install

**Yarn**:

```bash
yarn add snipsync
```

## Configure

### Package.json

Create a file called "snipsync.config.yaml" in the project root. This file specifies the following:

- The Github repositories where the tool will look for source code snippets.
- The local directory that contains the files to be spliced with the code snippets.

If the `ref` key is left blank or not specified, then the most recent commit from the master branch will be used.

Example snipsync.config.yaml:

```yaml
origins:
  - owner: temporalio
    repo: go-samples
    ref: 6880b0d09ddb6edf150e3095c90522602022578f
  - owner: temporalio
    repo: java-samples

target: docs
```

### Source code

In the source repo, wrap the code snippets in comments with a unique snippet identifier like this:

```go
// @@@START hellouniverse
func HelloUniverse() {
	fmt.Println("Hello Universe!")
}
// @@@END
```

In the example above, "hellouniverse" is the unique identifier for the code snippet.

### Target files

In the target files wrap the location with comments that reference the identifier of the code snippet that will be placed there:

```md
<!--START hellouniverse-->
<!--END-->
```

In the example above, the "hellouniverse" code snippet will be spliced between the comments. Any text inside of the placeholders will be replaced by the code snippet when the tool runs. The tool will automatically specify the code type for markdown rendering. For example, if the source file ends in ".go" then the code section will be written like this: `` ```go ``

## Run

From the root directory of your project run the following command:

```bash
snipsync
```

