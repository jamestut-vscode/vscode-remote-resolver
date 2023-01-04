# Remote Resolver

This extension demonstrates a simple example on how we could connect a local Visual Studio Code instance to a remote Visual Studio Code Server instance.

This extension is a simplified and independent version of the example Visual Studio Code's [test resolver extension](https://github.com/microsoft/vscode/tree/main/extensions/vscode-test-resolver).

## Usage

- Start the VSCode server on the remote host. The VSCode server has to be of the exact same version and commit as the local VSCode instance.
  
  - This extension does not support connection token: use the `--without-connection-token` option on the VSCode Server.

- Open the command from this extension (under the **Remote-Resolver**) group to connect to the VSCode Server instance.

### Downloading VSCode Server

Current VSCode commit hash can be found in this URL:

```
https://update.code.visualstudio.com/api/latest/$(IDENTIFIER)/$(QUALITY)
```

The hash from the URL above corresponds to the [VSCode's git repo](https://github.com/microsoft/vscode).

The download URL is here:

```
https://update.code.visualstudio.com/commit:$(COMMITHASH)/$(IDENTIFIER)/$(QUALITY)
```

Where:

- `COMMITHASH` is the hash of the commit obtained in the first URL.

- `QUALITY` is either `stable` or `insider`.

- `IDENTIFIER` for VSCode server is in form: `server-$(PLATFORM)-$(ARCH)`, optionally appending `-web` for a version capable of serving VSCode to a web browser (the one without `-web` is only suitable for use as remote host extension server).
  
  - `PLATFORM` is either `linux` or `darwin`.
  
  - `ARCH` is either `arm64` or `x64`.


