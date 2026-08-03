{ pkgs, ... }: {
  channel = "stable-23.11";
  packages = [
    pkgs.nodejs_20
  ];
  idx = {
    extensions = [ ];
    workspace = {
      onCreate = {
        npm-install = "npm install";
      };
    };
  };
}