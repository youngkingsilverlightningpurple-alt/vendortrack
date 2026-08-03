nix
# To learn more about how to use Nix to configure your environment
# see: https://firebase.google.com/docs/studio/customize-workspace
{pkgs}: {
  # Which nixpkgs channel to use.
  channel = "stable-24.11"; # or "unstable"

  # 1. ADD SUPABASE CLI: You need this to manage your new database
  packages = [
    pkgs.nodejs_20
    pkgs.zulu
    pkgs.supabase-cli 
  ];

  # 2. ENV VARS: Ensure your Supabase keys are accessible
  env = {
    # Add any non-secret project defaults here if needed
  };

  # 3. PREVIEWS: This tells Firebase Studio how to host your frontend
  # without the Firebase hosting/emulator setup.
  idx.previews = {
    enable = true;
    previews = {
      web = {
        command = ["npm" "run" "dev" "--" "--port" "$PORT" "--host" "0.0.0.0"];
        manager = "web";
      };
    };
  };

  # 4. EXTENSIONS: Useful for your new SQL-heavy workflow
  idx.extensions = [
    "prisma.prisma"       # Great for SQL syntax highlighting
    "ck8ne.pwsh-sql-utils" # SQL formatting
  ];
}
