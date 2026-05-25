{pkgs}: {
  deps = [
    pkgs.udev
    pkgs.cairo
    pkgs.pango
    pkgs.xorg.libxcb
    pkgs.xorg.libXrandr
    pkgs.xorg.libXfixes
    pkgs.xorg.libXext
    pkgs.xorg.libXdamage
    pkgs.xorg.libXcomposite
    pkgs.xorg.libX11
    pkgs.expat
    pkgs.mesa
    pkgs.alsa-lib
    pkgs.at-spi2-core
    pkgs.libxkbcommon
    pkgs.libdrm
    pkgs.cups
    pkgs.dbus
    pkgs.at-spi2-atk
    pkgs.atk
    pkgs.nss
    pkgs.nspr
    pkgs.glib
  ];
}
