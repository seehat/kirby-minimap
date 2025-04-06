<?php

use Kirby\Cms\App;

App::plugin('johannschopplich/minimap', [
    'api' => require __DIR__ . '/src/extensions/api.php'
]);
