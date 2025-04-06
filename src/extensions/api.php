<?php

use Kirby\Cms\App;
use Kirby\Form\Form;

return [
    'routes' => fn (App $kirby) => [
        [
            'pattern' => '__minimap__/model-fields',
            'method' => 'GET',
            'action' => function () use ($kirby) {
                $id = $kirby->request()->query()->get('id');
                $model = $id === 'site'
                    ? $kirby->site()
                    : $kirby->page($id, drafts: true) ?? $kirby->file($id, drafts: true);

                $fields = $model->blueprint()->fields();
                $languageCode = $model->kirby()->languageCode();
                $content = $model->content($languageCode)->toArray();
                $form = new Form([
                    'fields' => $fields,
                    'values' => $content,
                    'model' => $model,
                    'strict' => true
                ]);

                $fields = $form->fields()->toArray();
                unset($fields['title']);

                foreach ($fields as $index => $props) {
                    unset($fields[$index]['value']);
                }

                return $fields;
            }
        ]
    ]
];
