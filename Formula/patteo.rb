class Patteo < Formula
  desc "Fast, keyboard-first terminal client for Paseo"
  homepage "https://github.com/achintya-7/patteo"
  version "0.1.4"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.4/patteo-darwin-arm64.tar.gz"
      sha256 "e7eb6564f58d9b2d7488d51b68d52e3497d303bb6856c75b99c9309c1f65d94c"
    end
    on_intel do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.4/patteo-darwin-x64.tar.gz"
      sha256 "8b4128cab02023e9c29e1ac2f785791d839d3994d092ebd5f2031206dbd7900d"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.4/patteo-linux-arm64.tar.gz"
      sha256 "38c051ef386c9e631a6e0f34031a74fb3fa03fb867d8ff77cfd8c142fdccb1b2"
    end
    on_intel do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.4/patteo-linux-x64.tar.gz"
      sha256 "1e017b2b5e3ad165005e71afbc64774e520c826131140198045db31ed1ac6c05"
    end
  end

  def install
    bin.install "patteo"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/patteo --version")
  end
end
