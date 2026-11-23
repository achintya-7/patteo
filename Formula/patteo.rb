class Patteo < Formula
  desc "Fast, keyboard-first terminal client for Paseo"
  homepage "https://github.com/achintya-7/patteo"
  version "0.1.0"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.0/patteo-darwin-arm64.tar.gz"
      sha256 "8f8757b978d3190dab6d5618a5faf21e7228b20e51ba5e86b793213fc393fb73"
    end
    on_intel do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.0/patteo-darwin-x64.tar.gz"
      sha256 "915c4ec55052b75d6923f7326cac5f3bf8a5ffd144a399b2d21b20a47541da3c"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.0/patteo-linux-arm64.tar.gz"
      sha256 "6b9578d28553e8d4fefe2825eaa3d13e08a7c18ab8d48ee0dce56b92c95ce898"
    end
    on_intel do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.0/patteo-linux-x64.tar.gz"
      sha256 "c0e9f7f3496ce55d8d0e9e97b9477cb639b2698ebe4568ad98754e01236a5641"
    end
  end

  def install
    bin.install "patteo"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/patteo --version")
  end
end
