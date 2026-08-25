#!/usr/bin/env ruby

require "minitest/autorun"
require "tmpdir"
require "fileutils"
require_relative "check-github-action-pins"

class GitHubActionPinPolicyTest < Minitest::Test
  SHA = "0123456789abcdef0123456789abcdef01234567"
  DIGEST = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

  def test_accepts_immutable_remote_and_repository_local_references
    workflow = <<~YAML
      jobs:
        local-reusable:
          uses: ./.github/workflows/reusable.yml
        repository-reusable:
          uses: $/.github/workflows/reusable.yml
        remote-reusable:
          uses: example/workflows/.github/workflows/build.yml@#{SHA}
        steps:
          runs-on: ubuntu-latest
          steps:
            - uses: ./actions/local
            - uses: $/.github/actions/local
            - uses: example/action@#{SHA}
            - uses: docker://example/image@sha256:#{DIGEST}
    YAML

    assert_empty violations_for("valid.yml" => workflow)
  end

  def test_rejects_mutable_and_computed_step_references
    workflow = <<~YAML
      jobs:
        steps:
          runs-on: ubuntu-latest
          steps:
            - uses: example/action@v1
            - uses: example/action@master
            - uses: example/action@0123456
            - uses: "example/action@${{ inputs.ref }}"
            - uses: docker://example/image:latest
            - uses: "docker://${{ inputs.image }}@sha256:#{DIGEST}"
            - uses: "./actions/${{ inputs.action }}"
            - uses: ./../outside-workspace
    YAML

    violations = violations_for("mutable.yaml" => workflow)

    assert_equal 8, violations.length
    assert violations.any? { |violation| violation.include?("@v1") }
    assert violations.any? { |violation| violation.include?("@master") }
    assert violations.any? { |violation| violation.include?("@0123456") }
    assert violations.any? { |violation| violation.include?("inputs.ref") }
    assert violations.any? { |violation| violation.include?("image:latest") }
    assert violations.any? { |violation| violation.include?("inputs.image") }
    assert violations.any? { |violation| violation.include?("inputs.action") }
    assert violations.any? { |violation| violation.include?("outside-workspace") }
  end

  def test_rejects_mutable_reusable_workflow_reference
    workflow = <<~YAML
      jobs:
        reusable:
          uses: example/workflows/.github/workflows/build.yml@main
    YAML

    violations = violations_for("nested/reusable.yml" => workflow)

    assert_equal 1, violations.length
    assert_includes violations.first, "jobs.reusable.uses"
    assert_includes violations.first, "@main"
  end

  def test_scans_hidden_workflow_files
    workflow = <<~YAML
      jobs:
        hidden:
          runs-on: ubuntu-latest
          steps:
            - uses: example/action@main
    YAML

    violations = violations_for(".hidden.yml" => workflow)

    assert_equal 1, violations.length
    assert_includes violations.first, ".hidden.yml"
    assert_includes violations.first, "@main"
  end

  private

  def violations_for(files)
    Dir.mktmpdir do |directory|
      files.each do |relative_path, contents|
        path = File.join(directory, relative_path)
        FileUtils.mkdir_p(File.dirname(path))
        File.write(path, contents)
      end

      return GitHubActionPinPolicy.violations(directory)
    end
  end
end
