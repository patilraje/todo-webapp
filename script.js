let tasks = JSON.parse(localStorage.getItem("tasks")) || []

function renderTasks() {
    let list = document.getElementById("taskList")
    list.innerHTML = ""

    tasks.forEach((task, index) => {
        let li = document.createElement("li")
        li.textContent = task

        li.onclick = function() {
            tasks.splice(index, 1)
            saveTasks()
            renderTasks()
        }

        list.appendChild(li)
    })
}

function addTask() {

    let input = document.getElementById("taskInput")
    let task = input.value

    if(task === "") return

    tasks.push(task)

    saveTasks()
    renderTasks()

    input.value = ""
}

function saveTasks(){
    localStorage.setItem("tasks", JSON.stringify(tasks))
}

renderTasks()