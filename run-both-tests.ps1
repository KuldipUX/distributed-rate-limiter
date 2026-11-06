$projectPath = $PSScriptRoot

$job1 = Start-Job -ArgumentList $projectPath {
    param($path)
    Set-Location $path
    artillery run load-test.yml
}

$job2 = Start-Job -ArgumentList $projectPath {
    param($path)
    Set-Location $path
    artillery run load-test-server2.yml
}

Wait-Job $job1, $job2

Receive-Job $job1
Receive-Job $job2

Remove-Job $job1, $job2