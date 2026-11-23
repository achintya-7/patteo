class Patteo < Formula
  desc "Fast, keyboard-first terminal client for Paseo"
  homepage "https://github.com/achintya-7/patteo"
  version "0.1.5"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.5/patteo-darwin-arm64.tar.gz"
      sha256 "10a157801fbdb342f3f8e1c7e96aacf0fb912869b82b49f143eaab94c3fbdddc"
    end
    on_intel do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.5/patteo-darwin-x64.tar.gz"
      sha256 "b6eb499a3b9ab56a562adcb5c2ade9b79fe238b10dae2454624709075a44a3a2"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.5/patteo-linux-arm64.tar.gz"
      sha256 "37013d2227575e855c0798b4aea9eecc8c017a140cadac32e7078233b55f5a7f"
    end
    on_intel do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.5/patteo-linux-x64.tar.gz"
      sha256 "4ae1e5f864de4829d7557f643eba547391d8a2f62abdfc720a97f2ab8986b126"
    end
  end

  def install
    bin.install "patteo"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/patteo --version")
  end
end
