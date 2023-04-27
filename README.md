# VSCode REH Connector

Use this extension to connect to a remote VSCode REH (Remote Extension Host) server. This extension is similar to the official [VSCode Remote Extension](https://github.com/microsoft/vscode-remote-release), but this is geared towards those who prefers manual configurations or users of non-official version of Visual Studio Code (e.g. [OSS version of VSCode](https://github.com/microsoft/vscode) and [VSCodium](https://vscodium.com/)).

By setting up the REH independently instead of automatically like the official VSCode SSH Extension, there are many advantages. For example:

- Less resource usage when connecting to remote host. This extension does not check or attempt to download a matching REH version in any way.
- Ability to run REH as users other than your SSH login. For example, this allows us to run VSCode REH as `root` when the SSH server does not allow direct root login, but allows `sudo` access.
- by daemonizing the REH on the remote host, instant reconnection can be achieved.

I highly recommend my [customized version of VSCode](https://github.com/jamestut/vscode). That version of VSCode has some changes, including making reconnection attempts faster and more reliable.

## Usage

- Start the VSCode server on the remote host. The VSCode server has to be of the exact same version and commit hash as the local VSCode instance.
- This extension's commands are available under the **REH Resolver** group name. Use one of those commands to connect to a VSCode REH instance via TCP/IP.
- Alternatively, click the remote host indicator on the bottom left to list and open commands exclusively from remote connector extensions.

### Downloading Official VSCode Server

If you are using the official VSCode build, follow these steps to obtain the official REH build.

1. Get the current VSCode commit hash by doing HTTP `GET` to this URL:

    ```
    https://update.code.visualstudio.com/api/latest/$(IDENTIFIER)/$(QUALITY)
    ```

    The hash from the URL above corresponds to the [VSCode's git repo](https://github.com/microsoft/vscode).

2. Download the REH from this URL:

    ```
    https://update.code.visualstudio.com/commit:$(COMMITHASH)/$(IDENTIFIER)/$(QUALITY)
    ```

Where:

- `COMMITHASH` is the hash of the commit obtained in the first URL.
- `QUALITY` is either `stable` or `insider`.
- `IDENTIFIER` for VSCode server is in form: `server-$(PLATFORM)-$(ARCH)`, optionally appending `-web` for a version capable of serving VSCode to a web browser (the one without `-web` is only suitable for use as remote host extension server).
  - `PLATFORM` is either `linux` or `darwin`.
  - `ARCH` is either `arm64` or `x64`.

An example for the `IDENTIFIER` would be:

- `server-darwin-arm64` for use with macOS on Apple Silicon.
- `server-linux-x64` for use with Linux on x86_64.

## Building

1. Clone this repository.
2. Run `npm install`.
3. Run `npm vscode:publish` to generate the `.vsix`.
