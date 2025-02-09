# VSCode REH Connector

Use this extension to connect to a remote VSCode REH (Remote Extension Host) server. This extension is similar to the official [VSCode Remote Extension](https://github.com/microsoft/vscode-remote-release), but this is geared towards those who prefers manual configurations or users of non-official version of Visual Studio Code (e.g. [OSS version of VSCode](https://github.com/microsoft/vscode) and [VSCodium](https://vscodium.com/)).

By setting up the REH independently instead of automatically like the official VSCode SSH Extension, there are many advantages. For example:

- Less resource usage when connecting to remote host. This extension does not check or attempt to download a matching REH version in any way.
- Ability to run REH as users other than your SSH login. For example, this allows us to run VSCode REH as `root` when the SSH server does not allow direct root login, but allows `sudo` access.
- by daemonizing the REH on the remote host, instant reconnection can be achieved.

This extension is bundled in my [customized version of VSCode](https://github.com/jamestut/vscode). This extension can be compiled separately, but it will need the appropriate `.d.ts` files from VSCode. This extension depends on the additional APIs provided in the customized VSCode, thus it might not work on properly on the mainline versions of VSCode.

## Usage

- Start the VSCode server on the remote host. The VSCode server has to be of the exact same version and commit hash as the local VSCode instance.
- This extension's commands are available under the **REH Resolver** group name. Use one of those commands to connect to a VSCode REH instance.
- Alternatively, click the remote host indicator on the bottom left to list and open commands exclusively from remote connector extensions.

## Remote Specifications

The **remote address** must be defined in the following format:

```
(transport method)+(address specification)(+connection token)
```

The address specification depends on the transport method used. The following transport methods are supported:

- `tcp`
  Connects to an REH instance using TCP. Address is in form of `host:port`. `host` can be a hostname, IPv4 address, or IPv6 address. IPv6 addresses can be optionally enclosed with a pair of square brackets (`[]`).

**Connection tokens** must consist of alphanumeric only.

For **remote labels**, only these characters are allowed:

- Alphanumeric
- Space
- Dash (`-`) and dot (`.`).
