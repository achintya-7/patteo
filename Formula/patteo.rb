class Patteo < Formula
  desc "Fast, keyboard-first terminal client for Paseo"
  homepage "https://github.com/achintya-7/patteo"
  version "0.1.5"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.5/patteo-darwin-arm64.tar.gz"
      sha256 "8cb16033407a2ed6880389e80172b6892e4ee0340baac2fe2a8277537ee5b313"
    end
    on_intel do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.5/patteo-darwin-x64.tar.gz"
      sha256 "aed5c5c3d7a27c019a0506176906a0d4d4a1915367505e8ac7c96317bc0ae3e8"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.5/patteo-linux-arm64.tar.gz"
      sha256 "076235cd2067379335adecc49ce266ce1cccba31564de542be481abeacce67ac"
    end
    on_intel do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.5/patteo-linux-x64.tar.gz"
      sha256 "3d3dbd73a8e21f1aff08411c48a9e9231c43ccdcaeac2a8cfea46a45fb49dcf9"
    end
  end

  def install
    bin.install "patteo"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/patteo --version")
  end
end
