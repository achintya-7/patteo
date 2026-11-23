class Patteo < Formula
  desc "Fast, keyboard-first terminal client for Paseo"
  homepage "https://github.com/achintya-7/patteo"
  version "0.1.2"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.2/patteo-darwin-arm64.tar.gz"
      sha256 "1375df5b1edde3b54fa53c45037e815f91235a418de80cf0ec42b0263b66817a"
    end
    on_intel do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.2/patteo-darwin-x64.tar.gz"
      sha256 "62adb1b5192c40a8fbc26672ea33df91d9bfe4fbf11bc6f7a2f5b85733ffb146"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.2/patteo-linux-arm64.tar.gz"
      sha256 "bc33651c739be5928d9a5018337b5b864f9ccd5bc680ca95b40ac99720c10372"
    end
    on_intel do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.2/patteo-linux-x64.tar.gz"
      sha256 "f1e4c2b698544327ad1a190caa59889548aa6980c41b3137695b5b778f0c5c64"
    end
  end

  def install
    bin.install "patteo"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/patteo --version")
  end
end
