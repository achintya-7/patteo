class Patteo < Formula
  desc "Fast, keyboard-first terminal client for Paseo"
  homepage "https://github.com/achintya-7/patteo"
  version "0.1.3"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.3/patteo-darwin-arm64.tar.gz"
      sha256 "411981d1f1d8c3038e248104a1fbb53f2e9721fe54c2a8d7b4931ed11183502c"
    end
    on_intel do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.3/patteo-darwin-x64.tar.gz"
      sha256 "4d6f88cea325ddf13b00ccb72f631453963f0717a73661b816be3cbe9a844e7b"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.3/patteo-linux-arm64.tar.gz"
      sha256 "3244bbb6072a2cbbac9c93e29be26bc0b9a4ae1659d3317a46e230d6b95ff27c"
    end
    on_intel do
      url "https://github.com/achintya-7/patteo/releases/download/v0.1.3/patteo-linux-x64.tar.gz"
      sha256 "b659e2884db9121e88620d70606dfcdf5652ec4614da7a3cc24c6d3fd1b7f832"
    end
  end

  def install
    bin.install "patteo"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/patteo --version")
  end
end
