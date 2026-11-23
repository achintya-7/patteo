class Patteo < Formula
  desc "Fast, keyboard-first terminal client for Paseo"
  homepage "https://github.com/achintya-7/patteo"
  version "0.1.1"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.1/patteo-darwin-arm64.tar.gz"
      sha256 "ca2dc01b3829c7b4dc5d0e2ec1d508fddbbe5041573dc1f004ff65c915f1024f"
    end
    on_intel do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.1/patteo-darwin-x64.tar.gz"
      sha256 "20d22e6c297aacb4dd5e1a0c05492b779ffec5c31089631c4e3aab0616de65bb"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.1/patteo-linux-arm64.tar.gz"
      sha256 "b53a31caabb3b09f63aff29669150a25244c0dcdc7e103c6a091a2d02d90f1aa"
    end
    on_intel do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.1/patteo-linux-x64.tar.gz"
      sha256 "306f1d6a7d88bdd69d74ae60b9adfb3f03a4421534a8ab0c755cefaec0f27152"
    end
  end

  def install
    bin.install "patteo"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/patteo --version")
  end
end
